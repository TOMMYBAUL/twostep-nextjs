/**
 * Pipeline embed CLIP (Cycle 8.5) — du product avec photo au vector dans Vectorize.
 *
 * 3 entrées principales :
 *   1. embedAndStoreProduct(productId) — async, bootstrap ou re-embed manuel
 *   2. findSimilarProductsByVector(embedding) — query Vectorize topK + score
 *   3. tryClipMatchForProduct(productId, brand, category) — utilisé par cascade-engine
 *      pour décider si Tier 4 ajoute des points au score combiné
 *
 * Le pipeline ne gère PAS les jobs en background — c'est synchronisé avec le caller.
 * Pour scaler à 50 marchands × 200 produits = 10k embeddings, il faudra Inngest
 * (déjà recommandé brain audit-angles-morts 2026-04-25). V1 = appels en série.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { embedImageViaReplicate } from "@/lib/enrichment/clip-replicate";
import {
    deleteVectorById,
    getVectorById,
    queryVector,
    upsertVectors,
    type VectorizeQueryMatch,
} from "@/lib/enrichment/vectorize-client";

/** Seuil de similarité cosine pour considérer un match Tier 4 valide. */
const CLIP_MATCH_THRESHOLD = 0.95;

/** URL non-publique (Drive privé, signed URLs) → on skip car Replicate ne peut pas pull. */
const NON_PUBLIC_URL_PATTERNS = [
    /drive\.google\.com\/file\/d\/[^/]+(?!\/(view|preview))/, // Drive privé sans /view
    /\.dropbox\.com\/.*\?dl=0/,                                 // Dropbox privé
    /signed.*\?token=/i,                                        // Signed URLs avec token
];

function isProbablyPublicUrl(url: string): boolean {
    if (!url) return false;
    if (!/^https?:\/\//i.test(url)) return false;
    return !NON_PUBLIC_URL_PATTERNS.some((re) => re.test(url));
}

export type EmbedOutcome =
    | { status: "embedded"; model: string; latency_ms: number }
    | { status: "skipped"; reason: string }
    | { status: "failed"; error: string };

/**
 * Pipeline complet : embed photo product + push Vectorize + update DB.
 * Idempotent — re-call sur un produit déjà embeddé re-fait l'embed et upsert le vector.
 */
export async function embedAndStoreProduct(productId: string): Promise<EmbedOutcome> {
    const supabase = createAdminClient();

    // 1. Récupère product
    const { data: product, error } = await supabase
        .from("products")
        .select("id, merchant_id, photo_url, photo_processed_url, brand, category")
        .eq("id", productId)
        .single();

    if (error || !product) {
        return { status: "failed", error: `Product ${productId} not found` };
    }

    // 2. Choix de la photo : preferer photo_processed_url (legacy détourée),
    // fallback photo_url. NB : rembg ABANDONNÉ 2026-04-28 — les nouveaux
    // products n'auront plus photo_processed_url. Comportement existant
    // conservé pour les anciens products en DB.
    const photoUrl = product.photo_processed_url ?? product.photo_url;
    if (!photoUrl) {
        await markStatus(supabase, productId, "skipped", null, "no_photo");
        return { status: "skipped", reason: "no_photo" };
    }
    if (!isProbablyPublicUrl(photoUrl)) {
        await markStatus(supabase, productId, "skipped", null, "non_public_url");
        return { status: "skipped", reason: "non_public_url" };
    }

    // 3. Embed via Replicate
    let embedResult;
    try {
        embedResult = await embedImageViaReplicate(photoUrl);
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "unknown_replicate_error";
        await markStatus(supabase, productId, "failed", null, errorMsg);
        return { status: "failed", error: errorMsg };
    }

    // 4. Upsert dans Vectorize
    try {
        await upsertVectors([
            {
                id: productId,
                values: embedResult.embedding,
                metadata: {
                    merchant_id: product.merchant_id,
                    brand: product.brand ?? "",
                    category: product.category ?? "",
                },
            },
        ]);
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "unknown_vectorize_error";
        await markStatus(supabase, productId, "failed", embedResult.model, errorMsg);
        return { status: "failed", error: errorMsg };
    }

    // 5. Mark embedded en DB
    await markStatus(supabase, productId, "embedded", embedResult.model, null);

    return { status: "embedded", model: embedResult.model, latency_ms: embedResult.latency_ms };
}

/** Helper : update products.clip_embedding_* */
async function markStatus(
    supabase: ReturnType<typeof createAdminClient>,
    productId: string,
    status: "embedded" | "failed" | "skipped",
    model: string | null,
    error: string | null,
): Promise<void> {
    const update: Record<string, unknown> = {
        clip_embedding_status: status,
        clip_embedding_error: error,
    };
    if (status === "embedded") {
        update.clip_embedding_model = model;
        update.clip_embedded_at = new Date().toISOString();
    }
    await supabase.from("products").update(update).eq("id", productId);
}

/**
 * Re-embed query : récupère un product embeddé, query Vectorize topK voisins.
 * Utilisé par cascade pour matching Tier 4.
 *
 * Approche : on n'a pas le vector original stocké en DB locale (single source =
 * Vectorize). Donc pour query, on doit soit :
 *  (a) re-embed la photo du product (coûte un appel Replicate)
 *  (b) récupérer le vector via Vectorize getByIds (gratuit, instant)
 *
 * On choisit (b). L'API Vectorize supporte `/get-by-ids`.
 */
export async function tryClipMatchForProduct(productId: string): Promise<{
    matched: boolean;
    score: number;
    candidate?: VectorizeQueryMatch;
}> {
    const supabase = createAdminClient();
    const { data: product } = await supabase
        .from("products")
        .select("clip_embedding_status, brand, category, merchant_id")
        .eq("id", productId)
        .single();

    if (!product || product.clip_embedding_status !== "embedded") {
        return { matched: false, score: 0 };
    }

    // Cycle 9 : récupère le vector existant via getVectorById, puis query topK.
    let stored: Awaited<ReturnType<typeof getVectorById>> = null;
    try {
        stored = await getVectorById(productId);
    } catch (err) {
        // Vectorize indispo, log + skip Tier 4 (autres tiers continuent)
        if (process.env.NODE_ENV === "development") {
            console.warn(`[clip-pipeline] getVectorById ${productId} failed:`, err);
        }
        return { matched: false, score: 0 };
    }
    if (!stored) return { matched: false, score: 0 };

    return findSimilarByVector(stored.values, {
        excludeId: productId,
        brand: product.brand ?? null,
        category: product.category ?? null,
    });
}

/**
 * Variante directe : si on a déjà le vector en main (juste embeddé), on query
 * tout de suite les voisins. Évite le get-by-ids round-trip.
 */
export async function findSimilarByVector(
    embedding: number[],
    options: { excludeId?: string; brand?: string | null; category?: string | null } = {},
): Promise<{ matched: boolean; score: number; candidate?: VectorizeQueryMatch }> {
    // Filter metadata pour réduire l'espace de recherche
    const filter: Record<string, string> = {};
    if (options.brand) filter.brand = options.brand;
    if (options.category) filter.category = options.category;

    const result = await queryVector(embedding, {
        topK: 5,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        returnMetadata: "indexed",
    });

    // Filtre out le product lui-même (on ne veut pas matcher un produit avec lui-même)
    const candidates = options.excludeId
        ? result.matches.filter((m) => m.id !== options.excludeId)
        : result.matches;

    if (candidates.length === 0) return { matched: false, score: 0 };

    const best = candidates[0];
    if (best.score < CLIP_MATCH_THRESHOLD) return { matched: false, score: best.score };

    return { matched: true, score: best.score, candidate: best };
}

/** Cleanup quand un product est supprimé (cascade ON DELETE est dans la DB locale, mais Vectorize est externe). */
export async function deleteProductEmbedding(productId: string): Promise<void> {
    try {
        await deleteVectorById(productId);
    } catch (err) {
        // Tolérant : si le vector n'existe pas (jamais embeddé), pas grave.
        if (process.env.NODE_ENV === "development") {
            console.warn(`[clip-pipeline] deleteVectorById ${productId} failed:`, err);
        }
    }
}

export { CLIP_MATCH_THRESHOLD };

import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupEan, searchEanByName } from "@/lib/ean/lookup";
import { searchProductImage } from "@/lib/images/serper";
import { createImageJob } from "@/lib/images/jobs";
import { runCascade } from "@/lib/enrichment/cascade-engine";
import { SCORE_THRESHOLDS } from "@/lib/enrichment/score-cascade";
import { isPlaceholderName } from "@/lib/ingest/triage";
import { findSharedSkuEan } from "@/lib/enrichment/sku-identity";

export type EnrichableProduct = {
    id: string;
    merchant_id: string;
    ean: string | null;
    sku: string | null;
    name: string;
    brand: string | null;
    review_status: string | null;
};

/**
 * Enrichit UN produit : résolution d'identité (EAN déclaré → lookup ; sinon SKU
 * partagé ou recherche par nom → EAN deviné ; sinon photo) puis cascade de score
 * et décision de visibilité.
 *
 * Extrait de ingestStockSnapshot pour être exécuté DE FAÇON ASYNCHRONE par le
 * worker `/api/cron/enrich-products` — l'enrichissement (10-30 s/produit, appels
 * API externes en série) ne doit jamais bloquer la requête d'ingestion HTTP.
 *
 * Règles de sûreté préservées à l'identique :
 *  - produit déjà `validated` : identité tranchée, jamais re-devinée ni re-scorée
 *    (un push de stock ne doit pas pouvoir dépublier un produit validé) ;
 *  - EAN *deviné* (non déclaré au fichier) : plafonné à la file 1-tap, jamais
 *    auto-publié seul ;
 *  - pas de recherche nom/photo sur un placeholder ("EAN x" / "REF x") = bruit.
 *
 * @param admin client service_role (écritures, bypass RLS).
 */
export async function enrichOneProduct(product: EnrichableProduct, admin: SupabaseClient): Promise<void> {
    const isValidated = product.review_status === "validated";
    let eanGuessed = false;

    if (product.ean) {
        await lookupEan(product.ean, product.id);
    } else if (!isValidated) {
        // SKU match SCOPÉ AU MARCHAND (P0-11) : un SKU est un code interne — sans le
        // filtre merchant_id, le marchand B héritait l'EAN d'un produit du marchand A
        // partageant le même SKU = fausse identité cross-marchand. Source unique de la
        // règle (partagée avec resolve-ean.ts) → plus de divergence entre les 2 sites.
        let foundEan: string | null = await findSharedSkuEan(admin, product.merchant_id, product.sku, product.id);
        if (!foundEan && !isPlaceholderName(product.name)) {
            const found = await searchEanByName(product.name, product.brand);
            if (found) foundEan = found.ean;
        }
        if (foundEan) {
            eanGuessed = true;
            await admin.from("products").update({ ean: foundEan }).eq("id", product.id);
            await lookupEan(foundEan, product.id);
        } else if (!isPlaceholderName(product.name)) {
            const photoUrl = await searchProductImage(product.name, product.brand, null, product.sku);
            if (photoUrl) {
                await admin
                    .from("products")
                    .update({ photo_url: photoUrl, photo_processed_url: null, photo_source: "serper" })
                    .eq("id", product.id);
                await createImageJob(product.id, product.merchant_id, photoUrl);
            }
        }
    } else if (!isPlaceholderName(product.name)) {
        // Validé sans EAN : on complète au mieux la photo, rien d'autre.
        const photoUrl = await searchProductImage(product.name, product.brand, null, product.sku);
        if (photoUrl) {
            await admin
                .from("products")
                .update({ photo_url: photoUrl, photo_processed_url: null, photo_source: "serper" })
                .eq("id", product.id);
            await createImageJob(product.id, product.merchant_id, photoUrl);
        }
    }

    // Identité tranchée → pas de re-scoring, pas de changement de visibilité.
    if (isValidated) return;

    const { data: refreshed } = await admin
        .from("products")
        .select("ean, name, brand, sku")
        .eq("id", product.id)
        .single();
    if (!refreshed) return;

    const outcome = await runCascade({
        ean: refreshed.ean,
        name: refreshed.name,
        brand: refreshed.brand,
        sku: refreshed.sku,
    });

    const visible = eanGuessed ? false : outcome.visible;
    const reviewStatus = eanGuessed
        ? (outcome.score >= SCORE_THRESHOLDS.review_queue ? "pending" : "masked")
        : outcome.review_status;

    await admin.from("products").update({
        identification_score: outcome.score,
        identification_tiers: outcome.tiers_matched,
        visible,
        review_status: reviewStatus,
    }).eq("id", product.id);
}

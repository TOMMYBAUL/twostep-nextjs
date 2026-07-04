import { createAdminClient } from "@/lib/supabase/admin";
import { lookupEan, EAN_NOT_FOUND_SOURCE, EAN_NOT_FOUND_TTL_MS } from "@/lib/ean/lookup";
import { searchProductImage } from "@/lib/images/serper";
import { createImageJob } from "@/lib/images/jobs";
import { captureError } from "@/lib/error";
import { chunk } from "@/lib/ingest/reconcile";

type ProductToEnrich = { id: string; ean: string };

/** Page de scan candidats (borne les URLs PostgREST et les allers-retours). */
const CANDIDATE_PAGE_SIZE = 500;

/**
 * Garde-fou : nombre max de candidats scannés par appel. Avant ce fix, le SELECT
 * non borné était de toute façon tronqué à 1000 par PostgREST (max-rows) ; on
 * garde un plafond du même ordre pour ne pas transformer le sync POS (qui appelle
 * ceci en synchrone) en scan illimité. Les candidats au-delà seront vus aux runs
 * suivants (cron toutes les 2 h) au fur et à mesure que les premiers s'enrichissent
 * ou se font exclure par le cache négatif.
 */
const MAX_CANDIDATES_SCANNED = 2000;

/**
 * Select products with EAN that haven't been enriched yet.
 *
 * C1 (2026-07-04) : EXCLUT les produits dont l'EAN porte un marqueur négatif
 * FRAIS dans `ean_lookups` (source='not_found', fetched_at < TTL ~30 j) — un EAN
 * déjà cherché partout sans résultat ne doit pas re-déclencher 4 lookups + Serper
 * + vision à chaque run. L'exclusion se fait PAR PAGE (pas après un LIMIT en DB) :
 * sinon, 50 produits récents tous bloqués masqueraient indéfiniment les plus
 * anciens jamais tentés (starvation).
 */
export async function selectProductsToEnrich(
    merchantId?: string,
    limit?: number,
): Promise<ProductToEnrich[]> {
    const supabase = createAdminClient();
    const selected: ProductToEnrich[] = [];
    let offset = 0;

    // Pagination OFFSET assumée ici (ordre created_at desc = priorité produit récent,
    // pas de colonne keyset unique compatible) : un décalage sous écriture concurrente
    // fait au pire sauter un produit CE run — transient, il revient au run suivant
    // (le sélecteur re-tourne toutes les 2 h tant que canonical_name est null).
    while (offset < MAX_CANDIDATES_SCANNED) {
        let query = supabase
            .from("products")
            .select("id, ean")
            .not("ean", "is", null)
            .is("canonical_name", null);

        if (merchantId) {
            query = query.eq("merchant_id", merchantId);
        }

        query = query
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
            .range(offset, offset + CANDIDATE_PAGE_SIZE - 1);

        const { data, error } = await query;
        if (error || !data) {
            // Comportement historique : échec de lecture → on rend ce qu'on a (souvent []).
            if (error) captureError(error, { context: "select-products-to-enrich", offset });
            return selected;
        }

        const candidates = data.filter((p): p is ProductToEnrich => p.ean !== null);
        const blocked = await recentlyNotFoundEans(supabase, candidates.map((p) => p.ean));

        for (const p of candidates) {
            if (blocked.has(p.ean)) continue;
            selected.push(p);
            if (limit && selected.length >= limit) return selected;
        }

        if (data.length < CANDIDATE_PAGE_SIZE) break;
        offset += CANDIDATE_PAGE_SIZE;
    }

    return selected;
}

/**
 * EANs porteurs d'un marqueur négatif FRAIS (source='not_found', < TTL).
 * Fail-OPEN sur erreur de lecture : on n'exclut pas (le guard négatif de
 * `lookupEan` bloque de toute façon les appels externes — 1 read DB par produit,
 * zéro spend) plutôt que de geler l'enrichissement sur un blip ; visible Sentry.
 */
async function recentlyNotFoundEans(
    supabase: ReturnType<typeof createAdminClient>,
    eans: string[],
): Promise<Set<string>> {
    const out = new Set<string>();
    if (eans.length === 0) return out;

    const cutoff = new Date(Date.now() - EAN_NOT_FOUND_TTL_MS).toISOString();

    for (const batch of chunk([...new Set(eans)], 500)) {
        const { data, error } = await supabase
            .from("ean_lookups")
            .select("ean")
            .in("ean", batch)
            .eq("source", EAN_NOT_FOUND_SOURCE)
            .gte("fetched_at", cutoff);

        if (error || !data) {
            if (error) captureError(error, { context: "ean-enrich-negative-cache-read" });
            continue;
        }
        for (const row of data) {
            if (row.ean) out.add(row.ean);
        }
    }

    return out;
}

/**
 * Enrich all non-enriched products for a merchant.
 * Called synchronously during POS sync.
 */
export async function enrichNewProducts(merchantId: string): Promise<{ enriched: number; failed: number }> {
    const products = await selectProductsToEnrich(merchantId);

    let enriched = 0;
    let failed = 0;

    for (const product of products) {
        try {
            const success = await lookupEan(product.ean, product.id);
            if (success) enriched++;
            else failed++;
        } catch (err) {
            failed++;
            captureError(err, { productId: product.id, ean: product.ean, context: "ean-enrich" });
        }
    }

    // Second pass: products WITHOUT EAN that still have no photo → Serper only
    await enrichProductsWithoutEan(merchantId);

    return { enriched, failed };
}

/**
 * Find photos via Serper for products that have no EAN and no photo.
 */
export async function enrichProductsWithoutEan(merchantId: string): Promise<void> {
    const supabase = createAdminClient();

    const { data: products } = await supabase
        .from("products")
        .select("id, name, brand, merchant_id")
        .eq("merchant_id", merchantId)
        .is("ean", null)
        .is("photo_url", null)
        .limit(50);

    if (!products || products.length === 0) return;

    for (const product of products) {
        try {
            const photoUrl = await searchProductImage(product.name, product.brand);
            if (photoUrl) {
                await supabase
                    .from("products")
                    .update({
                        photo_url: photoUrl,
                        photo_processed_url: null,
                        photo_source: "serper",
                    })
                    .eq("id", product.id);

                await createImageJob(product.id, product.merchant_id, photoUrl, supabase as any);
            }
        } catch (err) {
            captureError(err, { productId: product.id, context: "serper-enrich-no-ean" });
        }
    }
}

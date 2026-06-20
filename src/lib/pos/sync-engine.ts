import { getAdapter, type POSProduct, type POSPromo, type POSAdapterOptions } from "@/lib/pos";
import { createClient } from "@/lib/supabase/server";
import { ensureFreshAccessToken } from "@/lib/pos/access-token";
import { captureError } from "@/lib/error";
import { createImageJob } from "@/lib/images/jobs";
import { resolveProductSize } from "@/lib/pos/extract-size";
import { pushInventoryToGoogle } from "@/lib/google/inventory";
import { categorizeMerchantProducts } from "@/lib/ai/categorize";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type SyncResult = {
    products_created: number;
    products_updated: number;
    stock_updated: number;
    promos_imported: number;
    products_enriched: number;
    pos_items_total: number;
    visible_count: number;
};

/**
 * Calcule les produits "orphelins" à masquer = ceux liés à un pos_item_id qui
 * n'est plus dans le catalogue POS courant.
 *
 * GARDE ANTI "CATALOGUE FANTÔME" : si le catalogue courant est VIDE, on ne masque
 * RIEN. Un getCatalog vide est quasi toujours une erreur transitoire (rate-limit,
 * 5xx, token) plutôt qu'un marchand ayant tout supprimé. Sans ce garde, un hoquet
 * POS effacerait toute la vitrine du marchand — le mode d'échec qui a tué les
 * concurrents (catalogue fantôme). Ceinture+bretelles : les adapters lèvent déjà
 * sur réponse non-OK, ceci protège même d'un futur adapter qui régresserait.
 */
export function computeOrphanProductIds(
    allProducts: Array<{ id: string; pos_item_id: string | null }>,
    currentPosItemIds: Set<string>,
): string[] {
    if (currentPosItemIds.size === 0) return [];
    return allProducts
        .filter((p) => p.pos_item_id && !currentPosItemIds.has(p.pos_item_id))
        .map((p) => p.id);
}

export type PosStockRow = {
    product_id: string;
    quantity: number;
    updated_at: string;
    source: string;
    source_ts: string;
};

/**
 * Pur (testable) : construit les lignes d'upsert stock d'un sync POS catalogue.
 *
 * DÉCLARE explicitement `source="pos_sync"` + `source_ts`. Sans ça, le DEFAULT
 * de la colonne (migration 104 : `source NOT NULL DEFAULT 'manual'`) s'applique à
 * la création de ligne → un stock issu d'une CAISSE (source la plus forte) serait
 * lu par la confidence comme `manual` → affiché « Stock probable » au lieu de
 * « Disponible ». La 104 impose que CHAQUE writer déclare sa source ; ce chemin
 * (sync catalogue, le gros du stock POS) était le seul à l'omettre. `source_ts`
 * suit `updated_at` (cohérence de la ligne) — l'horodatage POS de l'observation.
 */
export function buildPosStockRows(
    stockUpdates: { pos_item_id: string; quantity: number; updated_at: string }[],
    posItemToProductId: Map<string, string>,
): PosStockRow[] {
    return stockUpdates
        .filter((s) => posItemToProductId.has(s.pos_item_id))
        .map((s) => ({
            product_id: posItemToProductId.get(s.pos_item_id)!,
            quantity: s.quantity,
            updated_at: s.updated_at,
            source: "pos_sync",
            source_ts: s.updated_at,
        }));
}

// ─── Main sync function ─────────────────────────────────────────────

export async function syncMerchantPOS(
    merchantId: string,
    provider: string,
    forceFullSync?: boolean,
): Promise<SyncResult> {
    const supabase = await createClient();
    const adapter = getAdapter(provider);

    // ─── Acquire sync lock (advisory via syncing_since) ─────────
    const LOCK_TIMEOUT_MIN = 10;
    const staleThreshold = new Date(Date.now() - LOCK_TIMEOUT_MIN * 60_000).toISOString();
    const { data: lockRows } = await supabase
        .from("pos_connections")
        .update({ syncing_since: new Date().toISOString() })
        .eq("merchant_id", merchantId)
        .eq("provider", provider)
        .or(`syncing_since.is.null,syncing_since.lt.${staleThreshold}`)
        .select("id");

    if (!lockRows || lockRows.length === 0) {
        // Another sync is running for this merchant — skip
        return {
            products_created: 0,
            products_updated: 0,
            stock_updated: 0,
            promos_imported: 0,
            products_enriched: 0,
            pos_items_total: 0,
            visible_count: 0,
        };
    }

    const connId = lockRows[0].id;

    try {
        // ─── Token retrieval & refresh ───────────────────────────────

        const { data: conn, error: connError } = await supabase
            .from("pos_connections")
            .select("id, access_token, refresh_token, expires_at, shop_domain")
            .eq("id", connId)
            .single();

        if (connError || !conn) {
            throw new Error(`No POS connection found for ${provider}`);
        }

        // Refresh proactif via la SOURCE UNIQUE partagée (cf. access-token.ts) —
        // plus de logique de refresh dupliquée entre sync-engine et getActivePosAccessToken.
        const accessToken = await ensureFreshAccessToken(supabase, conn, adapter);
        if (accessToken === null) {
            throw new Error("Token expired and refresh failed");
        }

        // ─── Fetch POS data ──────────────────────────────────────────

        const adapterOpts: POSAdapterOptions = {
            shopDomain: conn.shop_domain ?? undefined,
        };

        const catalog = await adapter.getCatalog(accessToken, adapterOpts);
        const itemIds = catalog.map((p) => p.pos_item_id);
        const stockUpdates = await adapter.getStock(accessToken, itemIds, adapterOpts);
        const promos = await adapter.fetchPromos(accessToken, adapterOpts);

        // ─── Fusion intelligente ─────────────────────────────────────

        const result: SyncResult = {
            products_created: 0,
            products_updated: 0,
            stock_updated: 0,
            promos_imported: 0,
            products_enriched: 0,
            pos_items_total: catalog.length,
            visible_count: 0,
        };

        const posItemToProductId = new Map<string, string>();

        // ─── Build parent→variant mapping for Shopify promo matching ─
        // Shopify promos reference parent product IDs; we track variant IDs.
        // This map lets upsertPromo expand parent IDs to all known variant IDs.
        const posParentToVariants = new Map<string, string[]>();
        for (const p of catalog) {
            if (p.pos_parent_id) {
                const list = posParentToVariants.get(p.pos_parent_id) ?? [];
                list.push(p.pos_item_id);
                posParentToVariants.set(p.pos_parent_id, list);
            }
        }

        // ─── Pre-fetch all existing products for this merchant ──────
        // Uses the unified matching helpers from src/lib/enrichment/match-product.ts.
        const { buildProductIndex, matchProduct } = await import("@/lib/enrichment/match-product");
        const productIndex = await buildProductIndex(merchantId);

        // ─── Classify: update vs create ─────────────────────────────
        const toUpdate: Array<{ existingId: string; existingPhotoUrl: string | null; posProduct: POSProduct }> = [];
        const toCreate: POSProduct[] = [];

        for (const posProduct of catalog) {
            // POS sync uses pos_item_id and ean only — fuzzy name match is too risky here.
            const match = matchProduct(
                { posItemId: posProduct.pos_item_id, ean: posProduct.ean ?? null },
                productIndex,
                { allowFuzzy: false },
            );
            if (match) {
                toUpdate.push({
                    existingId: match.productId,
                    existingPhotoUrl: match.product.photo_url ?? null,
                    posProduct,
                });
                posItemToProductId.set(posProduct.pos_item_id, match.productId);
                continue;
            }
            toCreate.push(posProduct);
        }

        // ─── Update existing products ───────────────────────────────
        for (const { existingId, existingPhotoUrl, posProduct } of toUpdate) {
            await updateProduct(supabase, existingId, existingPhotoUrl, provider, posProduct);
        }
        result.products_updated = toUpdate.length;

        // ─── Create new products (sequential — uses RPC) ────────────
        // Track newly created products so we can run enrichment + mark them
        // as pending_review (queue validation) below.
        const newlyCreated: Array<{ productId: string; posProduct: POSProduct }> = [];
        for (const posProduct of toCreate) {
            const productId = await createProduct(supabase, merchantId, provider, posProduct, result);
            posItemToProductId.set(posProduct.pos_item_id, productId);
            newlyCreated.push({ productId, posProduct });
        }

        // Mark newly created POS products as pending_review.
        // Save the original POS name + photo so the merchant can compare
        // against the enriched proposal in /dashboard/stock/review (Task 11).
        if (newlyCreated.length > 0) {
            const proposedAt = new Date().toISOString();
            for (const { productId, posProduct } of newlyCreated) {
                await supabase
                    .from("products")
                    .update({
                        review_status: "pending_review",
                        // Defense in depth: hide pending products from the public catalog
                        // until the merchant validates them via /dashboard/stock/review.
                        visible: false,
                        enrichment_source: "pos_bootstrap",
                        enrichment_proposed_at: proposedAt,
                        original_name: posProduct.name,
                        original_image_url: posProduct.photo_url,
                    })
                    .eq("id", productId);
            }
        }

        // ─── Batch stock upsert ─────────────────────────────────────
        const stockRows = buildPosStockRows(stockUpdates, posItemToProductId);

        if (stockRows.length > 0) {
            const BATCH_SIZE = 500;
            for (let i = 0; i < stockRows.length; i += BATCH_SIZE) {
                await supabase
                    .from("stock")
                    .upsert(stockRows.slice(i, i + BATCH_SIZE), { onConflict: "product_id" });
            }
            result.stock_updated = stockRows.length;
        }

        // ─── Default stock for POS items without inventory tracking ──
        // Square only returns items with IN_STOCK state; untracked items
        // get no stock data and stay at 0 from create_product_with_stock.
        // Default new untracked products to stock=1 so they appear in feeds.
        const trackedPosItemIds = new Set(stockUpdates.map((s) => s.pos_item_id));
        const untrackedNewProducts = toCreate
            .filter((p) => !trackedPosItemIds.has(p.pos_item_id))
            .map((p) => posItemToProductId.get(p.pos_item_id))
            .filter((id): id is string => !!id);

        if (untrackedNewProducts.length > 0) {
            const nowIso = new Date().toISOString();
            await supabase.from("stock").upsert(
                untrackedNewProducts.map((id) => ({
                    product_id: id,
                    quantity: 1,
                    updated_at: nowIso,
                    source: "pos_sync",
                    source_ts: nowIso,
                })),
                { onConflict: "product_id" },
            );
        }

        // ─── Image jobs (uses pre-fetched data, no extra queries) ───
        for (const posProduct of catalog) {
            if (!posProduct.photo_url) continue;
            const productId = posItemToProductId.get(posProduct.pos_item_id);
            if (!productId) continue;
            const existing = productIndex.byPosItemId.get(posProduct.pos_item_id)
                ?? (posProduct.ean ? productIndex.byEan.get(posProduct.ean) : undefined);
            if (!existing?.photo_processed_url) {
                await createImageJob(productId, merchantId, posProduct.photo_url);
            }
        }

        // ─── Mark removed POS products as invisible ─────────────────
        const currentPosItemIds = new Set(catalog.map((p) => p.pos_item_id));
        const orphanIds = computeOrphanProductIds(productIndex.all, currentPosItemIds);

        if (orphanIds.length > 0) {
            await supabase
                .from("products")
                .update({ visible: false })
                .in("id", orphanIds);
        }

        // ─── Promos sync ─────────────────────────────────────────────

        for (const promo of promos) {
            await upsertPromo(supabase, merchantId, provider, promo, posItemToProductId, posParentToVariants, result);
        }

        // ─── EAN enrichment via unified resolveAndEnrich orchestrator ─
        // Runs only on products created by THIS sync. Updates brand/category/
        // photo and the cached ean_lookups row used by future merchants.

        try {
            const { resolveAndEnrich } = await import("@/lib/enrichment/resolve-ean");
            let enrichedCount = 0;
            for (const { productId, posProduct } of newlyCreated) {
                const r = await resolveAndEnrich({
                    productId,
                    ean: posProduct.ean,
                    name: posProduct.name,
                    merchantId,
                });
                if (r.source !== "none") enrichedCount++;
            }
            result.products_enriched = enrichedCount;
        } catch (err) {
            // Enrichment failure must never break the sync
            captureError(err, { merchantId, context: "ean-enrich-during-sync" });
        }

        // ─── Variant grouping by EAN ────────────────────────────────

        result.visible_count = await groupVariantsByEAN(supabase, merchantId);

        // ─── Google inventory push (best-effort) ────────────────────

        try {
            await pushInventoryToGoogle(merchantId);
        } catch (err) {
            captureError(err, { merchantId, context: "google-inventory-during-sync" });
        }

        // ─── Auto-categorize new products via AI ─────────────────────

        try {
            await categorizeMerchantProducts(merchantId);
        } catch (err) {
            captureError(err, { context: "auto-categorize", merchantId });
            // Non-blocking: categorization failure shouldn't break sync
        }

        // ─── Success bookkeeping ─────────────────────────────────────

        const now = new Date().toISOString();

        await supabase
            .from("pos_connections")
            .update({ last_sync_at: now, last_sync_status: "success", last_sync_error: null, syncing_since: null })
            .eq("id", connId);

        await supabase
            .from("merchants")
            .update({ pos_last_sync: now })
            .eq("id", merchantId);

        return result;
    } catch (error) {
        // ─── Error bookkeeping ───────────────────────────────────────

        const message = error instanceof Error ? error.message : String(error);

        await supabase
            .from("pos_connections")
            .update({ last_sync_status: "error", last_sync_error: message, syncing_since: null })
            .eq("merchant_id", merchantId)
            .eq("provider", provider);

        captureError(error, { merchantId, provider });
        throw error;
    }
}

// ─── Product creation (matching done via pre-fetch) ─────────────────

async function createProduct(
    supabase: Awaited<ReturnType<typeof createClient>>,
    merchantId: string,
    provider: string,
    posProduct: POSProduct,
    result: SyncResult,
): Promise<string> {
    const { data: created, error: createError } = await supabase.rpc("create_product_with_stock", {
        p_merchant_id: merchantId,
        p_name: posProduct.name,
        p_price: posProduct.price,
        p_ean: posProduct.ean,
        p_category: posProduct.category?.toLowerCase() ?? null,
        p_photo_url: posProduct.photo_url,
        p_pos_item_id: posProduct.pos_item_id,
        p_pos_provider: provider,
    });

    if (createError) throw new Error(`create_product_with_stock failed: ${createError.message}`);

    const size = resolveProductSize(posProduct);
    if (size) {
        await supabase.from("products").update({ size }).eq("id", created as string);
    }

    result.products_created++;
    return created as string;
}

async function updateProduct(
    supabase: Awaited<ReturnType<typeof createClient>>,
    productId: string,
    existingPhotoUrl: string | null,
    provider: string,
    posProduct: POSProduct,
): Promise<void> {
    const newSize = resolveProductSize(posProduct);

    // Si la photo POS a changé, forcer le retraitement (reset photo_processed_url)
    const photoChanged = posProduct.photo_url !== null && posProduct.photo_url !== existingPhotoUrl;

    const updates: Record<string, unknown> = {
        name: posProduct.name,
        price: posProduct.price,
        ean: posProduct.ean,
        pos_item_id: posProduct.pos_item_id,
        pos_provider: provider,
        photo_url: posProduct.photo_url ?? existingPhotoUrl,
        ...(photoChanged && { photo_processed_url: null }),
    };

    // Sync category from POS (only if POS provides one — preserve AI-assigned categories)
    if (posProduct.category) {
        updates.category = posProduct.category.toLowerCase();
    }

    // Only overwrite size if we can extract a new one; preserve existing size otherwise
    if (newSize !== null) {
        updates.size = newSize;
    }

    await supabase
        .from("products")
        .update(updates)
        .eq("id", productId);
}

// ─── Promo upsert ────────────────────────────────────────────────────

async function upsertPromo(
    supabase: Awaited<ReturnType<typeof createClient>>,
    merchantId: string,
    provider: string,
    promo: POSPromo,
    posItemToProductId: Map<string, string>,
    posParentToVariants: Map<string, string[]>,
    result: SyncResult,
): Promise<void> {
    // Expand promo.product_ids: some adapters (Shopify) use parent product IDs,
    // not variant IDs. Resolve parent → all variant IDs via posParentToVariants.
    const resolvedItemIds: string[] = [];
    for (const id of promo.product_ids) {
        const variants = posParentToVariants.get(id);
        if (variants && variants.length > 0) {
            resolvedItemIds.push(...variants);
        } else {
            // Already a variant ID or non-Shopify adapter — use as-is
            resolvedItemIds.push(id);
        }
    }

    for (const posItemId of resolvedItemIds) {
        const productId = posItemToProductId.get(posItemId);
        if (!productId) continue;

        const { data: product } = await supabase
            .from("products")
            .select("price")
            .eq("id", productId)
            .single();

        if (!product?.price) continue;

        const salePrice = Math.max(
            0,
            promo.type === "percentage"
                ? Math.round(product.price * (1 - promo.value / 100) * 100) / 100
                : Math.round((product.price - promo.value) * 100) / 100,
        );

        await supabase
            .from("promotions")
            .upsert(
                {
                    merchant_id: merchantId,
                    product_id: productId,
                    sale_price: salePrice,
                    starts_at: promo.starts_at,
                    ends_at: promo.ends_at,
                    pos_promo_id: promo.pos_promo_id,
                    pos_provider: provider,
                    visible: true,
                },
                { onConflict: "pos_promo_id,product_id" },
            );

        result.promos_imported++;
    }
}

// ─── Variant grouping by EAN prefix ─────────────────────────────────

/**
 * After sync, group products by EAN prefix (first 12 chars for EAN-13, 8 chars for EAN-8).
 * Products sharing the same EAN prefix are size variants of the same model.
 * Elects a principal product, computes available_sizes, marks others as variants.
 * Products without EAN are marked as not visible (merchant must complete them).
 */
export async function groupVariantsByEAN(
    supabase: SupabaseClient,
    merchantId: string,
): Promise<number> {
    const { data: products } = await supabase
        .from("products")
        .select("id, name, ean, size, photo_url, photo_processed_url, created_at, pos_item_id, review_status, stock(quantity)")
        .eq("merchant_id", merchantId)
        .is("variant_of", null);

    if (!products || products.length === 0) return 0;

    let visibleCount = 0;

    // A pending_review product must NEVER be made visible by this post-pass:
    // the merchant has not yet validated the enrichment, so it stays hidden
    // until they accept it from /dashboard/stock/review.
    // GATE : seul un produit explicitement `validated` (score ≥ 0,95 ou validé
    // 1-tap) peut devenir visible. Tout statut du pipeline cascade ('pending',
    // 'masked', 'pending_review') reste invisible — sinon ce post-pass court-circuite
    // le gate "zéro faux positif" (un produit non scoré avec stock deviendrait public).
    // review_status NULL = legacy/DEFAULT 'validated' → autorisé.
    const isPending = (p: { review_status?: string | null }) =>
        p.review_status != null && p.review_status !== "validated";

    // Products without EAN (or with EAN shorter than 8 chars — EAN-8 and EAN-13 both valid)
    const noEan = products.filter((p) => !p.ean || p.ean.length < 8);
    for (const p of noEan) {
        const qty = (p as any).stock?.[0]?.quantity ?? (p as any).stock?.quantity ?? 0;
        const hasNameAndPrice = !!p.name && p.name.trim().length > 0;
        // Untracked POS products have stock defaulted to 1, so qty > 0 works for all
        const computedVisible = hasNameAndPrice && qty > 0;
        const visible = isPending(p) ? false : computedVisible;
        if (visible) visibleCount++;
        const availableSizes = (p as any).size ? [{ size: (p as any).size, quantity: qty, source: "pos" as const }] : [];
        // Non-destructif : ne pas écraser un available_sizes déjà rempli (ex. par
        // l'ingestion fichier qui groupe les tailles en mémoire) avec un tableau vide.
        const upd: Record<string, unknown> = { visible };
        if (availableSizes.length > 0) upd.available_sizes = availableSizes;
        await supabase.from("products").update(upd).eq("id", p.id);
    }

    // Group products with EAN by prefix
    // EAN-8 : 8 chars total (use all 8 as prefix)
    // EAN-13 : use first 12 chars as prefix (last digit is check digit)
    const withEan = products.filter((p) => p.ean && p.ean.length >= 8);
    const groups = new Map<string, typeof withEan>();

    for (const product of withEan) {
        // EAN-8 → use full 8 chars; EAN-13 → use first 12 (strip check digit)
        const prefix = product.ean!.length <= 8 ? product.ean! : product.ean!.slice(0, 12);
        const group = groups.get(prefix) ?? [];
        group.push(product);
        groups.set(prefix, group);
    }

    for (const [, group] of groups) {
        if (group.length <= 1) {
            // Solo product with EAN — visible only if stock > 0
            const p = group[0];
            const qty = (p as any).stock?.[0]?.quantity ?? (p as any).stock?.quantity ?? 0;
            const availableSizes = p.size ? [{ size: p.size, quantity: qty, source: "pos" as const }] : [];
            const computedVisible = qty > 0;
            const visible = isPending(p) ? false : computedVisible;
            if (visible) visibleCount++;
            const upd: Record<string, unknown> = { visible, variant_of: null };
            if (availableSizes.length > 0) upd.available_sizes = availableSizes;
            await supabase.from("products").update(upd).eq("id", p.id);
            continue;
        }

        // Elect principal: prefer one with photo, then earliest created
        const principal = group.sort((a, b) => {
            const aHasPhoto = a.photo_url || a.photo_processed_url ? 1 : 0;
            const bHasPhoto = b.photo_url || b.photo_processed_url ? 1 : 0;
            if (bHasPhoto !== aHasPhoto) return bHasPhoto - aHasPhoto;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        })[0];

        // Compute available_sizes from all members. source:"pos" = taille issue
        // d'une variante de caisse structurée (fiable), pour le traçage d'origine.
        const availableSizes = group
            .filter((p) => p.size)
            .map((p) => ({
                size: p.size!,
                quantity: (p as any).stock?.[0]?.quantity ?? (p as any).stock?.quantity ?? 0,
                source: "pos" as const,
            }))
            .sort((a, b) => {
                const na = parseFloat(a.size);
                const nb = parseFloat(b.size);
                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                return a.size.localeCompare(b.size);
            });

        const totalStock = availableSizes.reduce((sum, s) => sum + s.quantity, 0);

        const computedGroupVisible = totalStock > 0;
        const groupVisible = isPending(principal) ? false : computedGroupVisible;
        if (groupVisible) visibleCount++;

        // Update principal (available_sizes seulement s'il y a des tailles : ne pas
        // écraser un available_sizes posé par l'ingestion fichier avec du vide).
        const updPrincipal: Record<string, unknown> = { visible: groupVisible, variant_of: null };
        if (availableSizes.length > 0) updPrincipal.available_sizes = availableSizes;
        await supabase.from("products").update(updPrincipal).eq("id", principal.id);

        // Update stock of principal to reflect total
        await supabase
            .from("stock")
            .upsert({ product_id: principal.id, quantity: totalStock }, { onConflict: "product_id" });

        // Mark other members as variants
        const variantIds = group.filter((p) => p.id !== principal.id).map((p) => p.id);
        if (variantIds.length > 0) {
            await supabase
                .from("products")
                .update({ variant_of: principal.id, visible: false })
                .in("id", variantIds);
        }
    }

    return visibleCount;
}

// ─── Recalculate available_sizes for a product group ─────────────────

/**
 * Called after a stock update (webhook or manual) to recalculate
 * the available_sizes JSON on the principal product of a group.
 */
export async function recalculateGroupSizes(
    supabase: SupabaseClient,
    productId: string,
): Promise<void> {
    // Find the principal: either this product IS the principal, or it has variant_of
    const { data: product } = await supabase
        .from("products")
        .select("id, variant_of")
        .eq("id", productId)
        .single();

    if (!product) return;

    const principalId = product.variant_of ?? product.id;

    // Get all members of this group (principal + variants)
    const { data: members } = await supabase
        .from("products")
        .select("id, size, stock(quantity)")
        .or(`id.eq.${principalId},variant_of.eq.${principalId}`);

    if (!members || members.length === 0) return;

    const availableSizes = members
        .filter((m) => m.size)
        .map((m) => ({
            size: m.size!,
            quantity: (m as any).stock?.[0]?.quantity ?? (m as any).stock?.quantity ?? 0,
            source: "pos" as const,
        }))
        .sort((a, b) => {
            const na = parseFloat(a.size);
            const nb = parseFloat(b.size);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.size.localeCompare(b.size);
        });

    const totalStock = availableSizes.reduce((sum, s) => sum + s.quantity, 0);

    // Aucune taille = produit SOLO, pas un groupe multi-tailles : ne PAS écraser sa ligne
    // stock autoritaire par le total des tailles (0) — faux « rupture » silencieux — ni son
    // available_sizes par []. (Même invariant que recalculateGroupSizesAdmin, cf. webhooks ;
    // les deux jumeaux doivent rester identiques — consolidation à faire en supervisé.)
    if (availableSizes.length === 0) return;

    // Writes du rollup non silencieux (cf. recalculateGroupSizesAdmin) : un échec rend
    // available_sizes/total périmé — on le REND VISIBLE via Sentry sans casser le flux.
    const { error: sizesErr } = await supabase
        .from("products")
        .update({ available_sizes: availableSizes })
        .eq("id", principalId);
    if (sizesErr) captureError(sizesErr, { context: "recalc-group-sizes", principalId, write: "available_sizes" });

    const { error: stockErr } = await supabase
        .from("stock")
        .upsert({ product_id: principalId, quantity: totalStock }, { onConflict: "product_id" });
    if (stockErr) captureError(stockErr, { context: "recalc-group-sizes", principalId, write: "stock_total" });
}

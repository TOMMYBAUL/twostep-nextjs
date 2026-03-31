import { getAdapter, type POSProduct, type POSPromo, type POSAdapterOptions } from "@/lib/pos";
import { createClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/email/encryption";
import { captureError } from "@/lib/error";
import { createImageJob } from "@/lib/images/jobs";
import { extractSize } from "@/lib/pos/extract-size";
import { enrichNewProducts } from "@/lib/ean/enrich";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type SyncResult = {
    products_created: number;
    products_updated: number;
    stock_updated: number;
    promos_imported: number;
    products_enriched: number;
};

// ─── Main sync function ─────────────────────────────────────────────

export async function syncMerchantPOS(
    merchantId: string,
    provider: string,
    forceFullSync?: boolean,
): Promise<SyncResult> {
    const supabase = await createClient();
    const adapter = getAdapter(provider);

    try {
        // ─── Token retrieval & refresh ───────────────────────────────

        const { data: conn, error: connError } = await supabase
            .from("pos_connections")
            .select("id, access_token, refresh_token, expires_at, shop_domain")
            .eq("merchant_id", merchantId)
            .eq("provider", provider)
            .single();

        if (connError || !conn) {
            throw new Error(`No POS connection found for ${provider}`);
        }

        let accessToken = decrypt(conn.access_token);

        const expiresAt = new Date(conn.expires_at).getTime();
        const fiveMinFromNow = Date.now() + 5 * 60 * 1000;

        if (expiresAt < fiveMinFromNow) {
            const refreshResult = await adapter.refreshToken(decrypt(conn.refresh_token));

            if (!refreshResult) {
                await supabase
                    .from("pos_connections")
                    .update({ last_sync_status: "error", last_sync_error: "Token expired" })
                    .eq("id", conn.id);

                throw new Error("Token expired and refresh failed");
            }

            await supabase
                .from("pos_connections")
                .update({
                    access_token: encrypt(refreshResult.access_token),
                    refresh_token: encrypt(refreshResult.refresh_token),
                    expires_at: refreshResult.expires_at,
                })
                .eq("id", conn.id);

            accessToken = refreshResult.access_token;
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
        };

        const posItemToProductId = new Map<string, string>();

        for (const posProduct of catalog) {
            const productId = await upsertProduct(supabase, merchantId, provider, posProduct, result);
            posItemToProductId.set(posProduct.pos_item_id, productId);
        }

        // ─── Image jobs ────────────────────────────────────────────

        for (const posProduct of catalog) {
            if (!posProduct.photo_url) continue;
            const productId = posItemToProductId.get(posProduct.pos_item_id);
            if (!productId) continue;

            const { data: prod } = await supabase
                .from("products")
                .select("photo_processed_url")
                .eq("id", productId)
                .single();

            if (!prod?.photo_processed_url) {
                await createImageJob(productId, merchantId, posProduct.photo_url);
            }
        }

        // ─── Stock sync ──────────────────────────────────────────────

        for (const stock of stockUpdates) {
            const productId = posItemToProductId.get(stock.pos_item_id);
            if (!productId) continue;

            await supabase
                .from("stock")
                .upsert(
                    {
                        product_id: productId,
                        quantity: stock.quantity,
                        updated_at: stock.updated_at,
                    },
                    { onConflict: "product_id" },
                );

            result.stock_updated++;
        }

        // ─── Promos sync ─────────────────────────────────────────────

        for (const promo of promos) {
            await upsertPromo(supabase, merchantId, provider, promo, posItemToProductId, result);
        }

        // ─── EAN enrichment (best-effort) ────────────────────────────

        try {
            const enrichResult = await enrichNewProducts(merchantId);
            result.products_enriched = enrichResult.enriched;
        } catch (err) {
            // Enrichment failure must never break the sync
            captureError(err, { merchantId, context: "ean-enrich-during-sync" });
        }

        // ─── Variant grouping by EAN ────────────────────────────────

        await groupVariantsByEAN(supabase, merchantId);

        // ─── Success bookkeeping ─────────────────────────────────────

        const now = new Date().toISOString();

        await supabase
            .from("pos_connections")
            .update({ last_sync_at: now, last_sync_status: "success", last_sync_error: null })
            .eq("id", conn.id);

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
            .update({ last_sync_status: "error", last_sync_error: message })
            .eq("merchant_id", merchantId)
            .eq("provider", provider);

        captureError(error, { merchantId, provider });
        throw error;
    }
}

// ─── Product upsert with 3-tier matching ─────────────────────────────

async function upsertProduct(
    supabase: Awaited<ReturnType<typeof createClient>>,
    merchantId: string,
    provider: string,
    posProduct: POSProduct,
    result: SyncResult,
): Promise<string> {
    // Match 1: by pos_item_id
    const { data: byPosId } = await supabase
        .from("products")
        .select("id, photo_url")
        .eq("merchant_id", merchantId)
        .eq("pos_item_id", posProduct.pos_item_id)
        .maybeSingle();

    if (byPosId) {
        await updateProduct(supabase, byPosId.id, byPosId.photo_url, provider, posProduct);
        result.products_updated++;
        return byPosId.id;
    }

    // Match 2: by EAN
    if (posProduct.ean) {
        const { data: byEan } = await supabase
            .from("products")
            .select("id, photo_url")
            .eq("merchant_id", merchantId)
            .eq("ean", posProduct.ean)
            .not("ean", "is", null)
            .maybeSingle();

        if (byEan) {
            await updateProduct(supabase, byEan.id, byEan.photo_url, provider, posProduct);
            result.products_updated++;
            return byEan.id;
        }
    }

    // Match 3: create new product
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

    // Set size after creation
    const size = extractSize(posProduct.name);
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
    await supabase
        .from("products")
        .update({
            name: posProduct.name,
            price: posProduct.price,
            ean: posProduct.ean,
            pos_item_id: posProduct.pos_item_id,
            pos_provider: provider,
            photo_url: posProduct.photo_url ?? existingPhotoUrl,
            size: extractSize(posProduct.name),
        })
        .eq("id", productId);
}

// ─── Promo upsert ────────────────────────────────────────────────────

async function upsertPromo(
    supabase: Awaited<ReturnType<typeof createClient>>,
    merchantId: string,
    provider: string,
    promo: POSPromo,
    posItemToProductId: Map<string, string>,
    result: SyncResult,
): Promise<void> {
    for (const posItemId of promo.product_ids) {
        const productId = posItemToProductId.get(posItemId);
        if (!productId) continue;

        const { data: product } = await supabase
            .from("products")
            .select("price")
            .eq("id", productId)
            .single();

        if (!product?.price) continue;

        const salePrice =
            promo.type === "percentage"
                ? Math.round(product.price * (1 - promo.value / 100) * 100) / 100
                : Math.round((product.price - promo.value) * 100) / 100;

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
 * After sync, group products by EAN prefix (first 12 chars).
 * Products sharing the same EAN prefix are size variants of the same model.
 * Elects a principal product, computes available_sizes, marks others as variants.
 * Products without EAN are marked as not visible (merchant must complete them).
 */
async function groupVariantsByEAN(
    supabase: SupabaseClient,
    merchantId: string,
): Promise<void> {
    const { data: products } = await supabase
        .from("products")
        .select("id, name, ean, size, photo_url, photo_processed_url, created_at, stock(quantity)")
        .eq("merchant_id", merchantId)
        .is("variant_of", null);

    if (!products || products.length === 0) return;

    // Mark products without EAN as not visible
    const noEan = products.filter((p) => !p.ean);
    if (noEan.length > 0) {
        await supabase
            .from("products")
            .update({ visible: false })
            .in("id", noEan.map((p) => p.id));
    }

    // Group products with EAN by prefix (first 12 chars)
    const withEan = products.filter((p) => p.ean && p.ean.length >= 12);
    const groups = new Map<string, typeof withEan>();

    for (const product of withEan) {
        const prefix = product.ean!.slice(0, 12);
        const group = groups.get(prefix) ?? [];
        group.push(product);
        groups.set(prefix, group);
    }

    for (const [, group] of groups) {
        if (group.length <= 1) {
            // Solo product with EAN — ensure visible, set available_sizes if it has a size
            const p = group[0];
            const qty = (p as any).stock?.[0]?.quantity ?? (p as any).stock?.quantity ?? 0;
            const availableSizes = p.size ? [{ size: p.size, quantity: qty }] : [];
            await supabase
                .from("products")
                .update({ visible: true, variant_of: null, available_sizes: availableSizes })
                .eq("id", p.id);
            continue;
        }

        // Elect principal: prefer one with photo, then earliest created
        const principal = group.sort((a, b) => {
            const aHasPhoto = a.photo_url || a.photo_processed_url ? 1 : 0;
            const bHasPhoto = b.photo_url || b.photo_processed_url ? 1 : 0;
            if (bHasPhoto !== aHasPhoto) return bHasPhoto - aHasPhoto;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        })[0];

        // Compute available_sizes from all members
        const availableSizes = group
            .filter((p) => p.size)
            .map((p) => ({
                size: p.size!,
                quantity: (p as any).stock?.[0]?.quantity ?? (p as any).stock?.quantity ?? 0,
            }))
            .sort((a, b) => {
                const na = parseFloat(a.size);
                const nb = parseFloat(b.size);
                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                return a.size.localeCompare(b.size);
            });

        const totalStock = availableSizes.reduce((sum, s) => sum + s.quantity, 0);

        // Update principal
        await supabase
            .from("products")
            .update({ visible: true, variant_of: null, available_sizes: availableSizes })
            .eq("id", principal.id);

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
        }))
        .sort((a, b) => {
            const na = parseFloat(a.size);
            const nb = parseFloat(b.size);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.size.localeCompare(b.size);
        });

    const totalStock = availableSizes.reduce((sum, s) => sum + s.quantity, 0);

    await supabase
        .from("products")
        .update({ available_sizes: availableSizes })
        .eq("id", principalId);

    await supabase
        .from("stock")
        .upsert({ product_id: principalId, quantity: totalStock }, { onConflict: "product_id" });
}

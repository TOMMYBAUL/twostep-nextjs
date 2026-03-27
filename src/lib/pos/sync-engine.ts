import { getAdapter, type POSProduct, type POSPromo } from "@/lib/pos";
import { createClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/email/encryption";
import { captureError } from "@/lib/error";

export type SyncResult = {
    products_created: number;
    products_updated: number;
    stock_updated: number;
    promos_imported: number;
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
            .select("id, access_token, refresh_token, expires_at")
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

        const catalog = await adapter.getCatalog(accessToken);
        const itemIds = catalog.map((p) => p.pos_item_id);
        const stockUpdates = await adapter.getStock(accessToken, itemIds);
        const promos = await adapter.fetchPromos(accessToken);

        // ─── Fusion intelligente ─────────────────────────────────────

        const result: SyncResult = {
            products_created: 0,
            products_updated: 0,
            stock_updated: 0,
            promos_imported: 0,
        };

        const posItemToProductId = new Map<string, string>();

        for (const posProduct of catalog) {
            const productId = await upsertProduct(supabase, merchantId, provider, posProduct, result);
            posItemToProductId.set(posProduct.pos_item_id, productId);
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
        p_category: posProduct.category,
        p_photo_url: posProduct.photo_url,
        p_pos_item_id: posProduct.pos_item_id,
        p_pos_provider: provider,
    });

    if (createError) throw new Error(`create_product_with_stock failed: ${createError.message}`);

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

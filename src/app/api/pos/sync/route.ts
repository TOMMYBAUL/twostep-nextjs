import { NextResponse } from "next/server";

import { squareAdapter } from "@/lib/pos/square";
import { lightspeedAdapter } from "@/lib/pos/lightspeed";
import { shopifyAdapter } from "@/lib/pos/shopify";
import { createClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/email/encryption";
import { captureError } from "@/lib/error";
import type { IPOSAdapter } from "@/lib/pos/types";

const adapters: Record<string, IPOSAdapter> = {
    square: squareAdapter,
    lightspeed: lightspeedAdapter,
    shopify: shopifyAdapter,
};

export async function POST() {
    try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id, pos_type")
        .eq("user_id", user.id)
        .single();

    if (!merchant) {
        return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
    }

    if (!merchant.pos_type) {
        return NextResponse.json({ error: "No POS connected" }, { status: 400 });
    }

    const adapter = adapters[merchant.pos_type];
    if (!adapter) {
        return NextResponse.json({ error: `Unsupported POS: ${merchant.pos_type}` }, { status: 400 });
    }

    // Get stored credentials
    const { data: creds } = await supabase
        .from("merchant_pos_credentials")
        .select("access_token, refresh_token, expires_at")
        .eq("merchant_id", merchant.id)
        .single();

    if (!creds) {
        return NextResponse.json({ error: "No POS credentials found" }, { status: 400 });
    }

    // Decrypt and refresh token if expired (or expiring within 5 min)
    let accessToken = decrypt(creds.access_token);
    const expiresAt = creds.expires_at ? new Date(creds.expires_at).getTime() : Infinity;
    const fiveMinFromNow = Date.now() + 5 * 60 * 1000;

    if (expiresAt < fiveMinFromNow && creds.refresh_token) {
        const refreshed = await adapter.refreshToken(decrypt(creds.refresh_token));
        if (refreshed) {
            accessToken = refreshed.access_token;
            await supabase.from("merchant_pos_credentials").update({
                access_token: encrypt(refreshed.access_token),
                refresh_token: refreshed.refresh_token ? encrypt(refreshed.refresh_token) : creds.refresh_token,
                expires_at: refreshed.expires_at,
                updated_at: new Date().toISOString(),
            }).eq("merchant_id", merchant.id);
        } else {
            return NextResponse.json({ error: "POS token expired — please reconnect" }, { status: 401 });
        }
    }

    try {
        // --- 1. Catalog sync ---
        const catalog = await adapter.getCatalog(accessToken);

        // Get existing POS-linked products for this merchant
        const { data: existing } = await supabase
            .from("products")
            .select("id, pos_item_id")
            .eq("merchant_id", merchant.id)
            .not("pos_item_id", "is", null);

        const existingMap = new Map(
            (existing || []).map((p) => [p.pos_item_id, p.id]),
        );

        let productsCreated = 0;
        let productsUpdated = 0;

        for (const item of catalog) {
            if (existingMap.has(item.pos_item_id)) {
                // Update existing product
                await supabase
                    .from("products")
                    .update({
                        name: item.name,
                        price: item.price,
                        ean: item.ean,
                        photo_url: item.photo_url,
                    })
                    .eq("id", existingMap.get(item.pos_item_id));
                productsUpdated++;
            } else {
                // Atomic: create product + stock row in one transaction
                const { data: newProductId } = await supabase.rpc("create_product_with_stock", {
                    p_merchant_id: merchant.id,
                    p_name: item.name,
                    p_price: item.price,
                    p_ean: item.ean,
                    p_photo_url: item.photo_url,
                    p_pos_item_id: item.pos_item_id,
                });

                if (newProductId) {
                    existingMap.set(item.pos_item_id, newProductId);
                }
                productsCreated++;
            }
        }

        // --- 2. Stock sync ---
        const posItemIds = catalog.map((p) => p.pos_item_id);
        const stockUpdates = await adapter.getStock(accessToken, posItemIds);

        let stockUpdated = 0;
        for (const update of stockUpdates) {
            const productId = existingMap.get(update.pos_item_id);
            if (!productId) continue;

            await supabase.from("stock").upsert({
                product_id: productId,
                quantity: Math.max(0, update.quantity),
            });
            stockUpdated++;
        }

        // --- 3. Update last sync timestamp ---
        await supabase
            .from("merchants")
            .update({ pos_last_sync: new Date().toISOString() })
            .eq("id", merchant.id);

        return NextResponse.json({
            synced: {
                products_created: productsCreated,
                products_updated: productsUpdated,
                stock_updated: stockUpdated,
            },
        });
    } catch (e) {
        captureError(e, { route: "pos/sync", merchantId: merchant?.id });
        return NextResponse.json(
            { error: "Sync failed" },
            { status: 500 },
        );
    }
    } catch (e) {
        captureError(e, { route: "pos/sync" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

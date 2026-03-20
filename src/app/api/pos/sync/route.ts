import { NextResponse } from "next/server";

import { squareAdapter } from "@/lib/pos/square";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
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

    if (merchant.pos_type !== "square") {
        return NextResponse.json({ error: "No POS connected" }, { status: 400 });
    }

    // Get stored credentials
    const { data: creds } = await supabase
        .from("merchant_pos_credentials")
        .select("access_token")
        .eq("merchant_id", merchant.id)
        .single();

    if (!creds) {
        return NextResponse.json({ error: "No POS credentials found" }, { status: 400 });
    }

    try {
        // --- 1. Catalog sync ---
        const catalog = await squareAdapter.getCatalog(creds.access_token);

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
                // Create new product + stock entry
                const { data: newProduct } = await supabase
                    .from("products")
                    .insert({
                        merchant_id: merchant.id,
                        pos_item_id: item.pos_item_id,
                        name: item.name,
                        price: item.price,
                        ean: item.ean,
                        photo_url: item.photo_url,
                    })
                    .select("id")
                    .single();

                if (newProduct) {
                    await supabase
                        .from("stock")
                        .insert({ product_id: newProduct.id, quantity: 0 });
                    existingMap.set(item.pos_item_id, newProduct.id);
                }
                productsCreated++;
            }
        }

        // --- 2. Stock sync ---
        const posItemIds = catalog.map((p) => p.pos_item_id);
        const stockUpdates = await squareAdapter.getStock(creds.access_token, posItemIds);

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
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Sync failed" },
            { status: 500 },
        );
    }
}

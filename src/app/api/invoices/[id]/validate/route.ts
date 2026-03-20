import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupEan } from "@/lib/ean/lookup";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    const { data: invoice } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .eq("id", id)
        .eq("merchant_id", merchant.id)
        .single();

    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoice.status === "imported") {
        return NextResponse.json({ error: "Already imported" }, { status: 400 });
    }

    const body = await request.json();
    const sellingPrices: Record<string, number> = body.selling_prices ?? {};

    let productsCreated = 0;
    let productsUpdated = 0;
    let stockUpdated = 0;

    const validItems = invoice.invoice_items.filter(
        (item: { status: string }) => item.status !== "rejected"
    );

    for (const item of validItems) {
        let productId: string | null = null;

        if (item.ean) {
            const { data: existing } = await supabase
                .from("products")
                .select("id")
                .eq("merchant_id", merchant.id)
                .eq("ean", item.ean)
                .single();

            if (existing) productId = existing.id;
        }

        if (!productId) {
            const { data: existing } = await supabase
                .from("products")
                .select("id")
                .eq("merchant_id", merchant.id)
                .ilike("name", item.name)
                .single();

            if (existing) productId = existing.id;
        }

        const sellingPrice = sellingPrices[item.id] ?? null;

        if (productId) {
            await supabase.from("products").update({
                purchase_price: item.unit_price_ht,
                ...(sellingPrice && { price: sellingPrice }),
                ...(item.ean && { ean: item.ean }),
            }).eq("id", productId);

            await supabase.rpc("update_stock_delta", {
                p_product_id: productId,
                p_delta: item.quantity,
            });

            await supabase
                .from("invoice_items")
                .update({ product_id: productId, status: "validated" })
                .eq("id", item.id);

            productsUpdated++;
            stockUpdated++;

            await adminSupabase.from("feed_events").insert({
                merchant_id: merchant.id,
                product_id: productId,
                event_type: "restock",
            });
        } else {
            const { data: newProduct } = await supabase
                .from("products")
                .insert({
                    merchant_id: merchant.id,
                    name: item.name,
                    ean: item.ean,
                    price: sellingPrice,
                    purchase_price: item.unit_price_ht,
                })
                .select()
                .single();

            if (newProduct) {
                await supabase.from("stock").insert({
                    product_id: newProduct.id,
                    quantity: item.quantity,
                });

                await supabase
                    .from("invoice_items")
                    .update({ product_id: newProduct.id, status: "validated" })
                    .eq("id", item.id);

                productsCreated++;
                stockUpdated++;

                await adminSupabase.from("feed_events").insert({
                    merchant_id: merchant.id,
                    product_id: newProduct.id,
                    event_type: "new_product",
                });

                // Fire-and-forget: enrich product with EAN data
                if (item.ean) {
                    lookupEan(item.ean, newProduct.id).catch(console.error);
                }
            }
        }
    }

    await supabase
        .from("invoices")
        .update({ status: "imported", validated_at: new Date().toISOString() })
        .eq("id", id);

    return NextResponse.json({
        products_created: productsCreated,
        products_updated: productsUpdated,
        stock_updated: stockUpdated,
    });
}

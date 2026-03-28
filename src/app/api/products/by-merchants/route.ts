import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const merchantIds = request.nextUrl.searchParams.get("merchant_ids");
    if (!merchantIds) {
        return NextResponse.json({ products: [] });
    }

    const ids = merchantIds.split(",").filter(Boolean).slice(0, 50);
    if (ids.length === 0) {
        return NextResponse.json({ products: [] });
    }

    const supabase = await createClient();

    // Only fetch products from the specified merchants
    const { data: products, error } = await supabase
        .from("products")
        .select("id, name, price, photo_url, photo_processed_url, category, merchant_id, created_at, merchants!inner(name, photo_url)")
        .in("merchant_id", ids)
        .order("created_at", { ascending: false })
        .limit(60);

    if (error) {
        return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    // Get stock and promos for these products
    const productIds = (products ?? []).map((p: any) => p.id);

    const [{ data: stockData }, { data: promoData }] = await Promise.all([
        supabase.from("stock").select("product_id, quantity").in("product_id", productIds),
        supabase.from("promotions").select("product_id, sale_price").in("product_id", productIds).gte("ends_at", new Date().toISOString()),
    ]);

    const stockMap = new Map((stockData ?? []).map((s: any) => [s.product_id, s.quantity]));
    const promoMap = new Map((promoData ?? []).map((p: any) => [p.product_id, p.sale_price]));

    const result = (products ?? [])
        .filter((p: any) => (stockMap.get(p.id) ?? 0) > 0)
        .map((p: any) => ({
            product_id: p.id,
            product_name: p.name,
            product_price: p.price,
            product_photo: p.photo_processed_url ?? p.photo_url,
            stock_quantity: stockMap.get(p.id) ?? 0,
            merchant_id: p.merchant_id,
            merchant_name: p.merchants?.name ?? "",
            merchant_photo: p.merchants?.photo_url ?? null,
            sale_price: promoMap.get(p.id) ?? null,
            category: p.category,
            distance_km: 0,
        }));

    return NextResponse.json({ products: result }, {
        headers: { "Cache-Control": "private, s-maxage=30" },
    });
}

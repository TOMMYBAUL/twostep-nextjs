import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const lat = parseFloat(params.get("lat") ?? "43.6047");
    const lng = parseFloat(params.get("lng") ?? "1.4442");
    const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
    const limit = Math.min(40, Math.max(1, parseInt(params.get("limit") ?? "20", 10)));
    const category = params.get("category") || null;
    const radius = 10;
    const offset = (page - 1) * limit;

    const supabase = await createClient();

    // Try dedicated RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_products_nearby", {
        user_lat: lat,
        user_lng: lng,
        radius_km: radius,
        filter_category: category,
        result_offset: offset,
        result_limit: limit,
    });

    if (!rpcError && rpcData) {
        const products = rpcData.map((row: any) => ({
            product_id: row.product_id,
            product_name: row.product_name,
            product_price: row.product_price,
            product_photo: row.product_photo,
            category: row.product_category,
            stock_quantity: row.stock_quantity,
            merchant_id: row.merchant_id,
            merchant_name: row.merchant_name,
            merchant_photo: row.merchant_photo,
            distance_km: row.distance_km,
            sale_price: row.sale_price,
        }));

        const { data: countData } = await supabase.rpc("get_products_nearby_count", {
            user_lat: lat, user_lng: lng, radius_km: radius, filter_category: category,
        });
        const total = countData ?? products.length;

        return NextResponse.json(
            { products, hasMore: offset + limit < total, total },
            { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
        );
    }

    // Fallback: use get_feed_nearby RPC that already works
    const { data, error } = await supabase.rpc("get_feed_nearby", {
        user_lat: lat,
        user_lng: lng,
        radius_km: radius,
        cursor_score: 999999,
        result_limit: 200,
    });

    if (error) {
        console.error("[products/discover] fallback error:", error.message);
        return NextResponse.json({ products: [], hasMore: false, total: 0 });
    }

    let items = data ?? [];

    // Deduplicate
    const seen = new Set<string>();
    items = items.filter((row: any) => {
        const key = `${row.product_id}::${row.merchant_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Category filter
    if (category) {
        const productIds = items.map((r: any) => r.product_id);
        const unique = [...new Set(productIds)];
        const { data: catData } = await supabase
            .from("products")
            .select("id, category")
            .in("id", unique);
        const catMap = new Map<string, string>();
        for (const row of catData ?? []) {
            if (row.category) catMap.set(row.id, row.category);
        }
        items = items.filter((row: any) => catMap.get(row.product_id) === category);
    }

    // Sort by distance
    items.sort((a: any, b: any) => a.distance_km - b.distance_km);

    // Resolve merchant photos
    const merchantIds = [...new Set(items.map((r: any) => r.merchant_id))];
    const { data: merchantData } = await supabase
        .from("merchants")
        .select("id, photo_url")
        .in("id", merchantIds.length > 0 ? merchantIds : ["__none__"]);
    const photoMap = new Map<string, string>();
    for (const row of merchantData ?? []) {
        if (row.photo_url) photoMap.set(row.id, row.photo_url);
    }

    // Resolve promos
    const productIds = [...new Set(items.map((r: any) => r.product_id))];
    const { data: promoData } = await supabase
        .from("promotions")
        .select("product_id, sale_price, ends_at")
        .in("product_id", productIds.length > 0 ? productIds : ["__none__"]);
    const promoMap = new Map<string, number>();
    const now = new Date();
    for (const pr of promoData ?? []) {
        if (!pr.ends_at || new Date(pr.ends_at) > now) {
            const existing = promoMap.get(pr.product_id);
            if (!existing || pr.sale_price < existing) {
                promoMap.set(pr.product_id, pr.sale_price);
            }
        }
    }

    const total = items.length;
    const paged = items.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    const products = paged.map((row: any) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        product_price: row.product_price,
        product_photo: row.product_photo,
        category: null,
        stock_quantity: row.stock_quantity,
        merchant_id: row.merchant_id,
        merchant_name: row.merchant_name,
        merchant_photo: photoMap.get(row.merchant_id) ?? null,
        distance_km: row.distance_km,
        sale_price: promoMap.get(row.product_id) ?? null,
    }));

    return NextResponse.json(
        { products, hasMore, total },
        { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
}

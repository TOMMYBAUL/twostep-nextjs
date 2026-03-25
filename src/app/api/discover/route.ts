import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { discoverQuery, parseQuery } from "@/lib/validation";

export async function GET(request: NextRequest) {
    const limited = rateLimit(request.headers.get("x-forwarded-for") ?? null, "discover", 60);
    if (limited) return limited;

    const parsed = parseQuery(request.nextUrl.searchParams, discoverQuery);
    if ("error" in parsed) return parsed.error;
    const { lat, lng, radius, section, category } = parsed.data;

    const supabase = await createClient();

    if (section === "promos") {
        const { data, error } = await supabase.rpc("get_promos_nearby", {
            user_lat: lat,
            user_lng: lng,
            radius_km: radius,
            result_offset: 0,
            result_limit: 20,
        });

        if (error) {
            console.error("[discover/promos] RPC error:", error.message);
            return NextResponse.json({ error: "Query failed" }, { status: 500 });
        }

        // Resolve categories for returned product IDs
        const productIds = (data ?? []).map((r: any) => r.product_id);
        const categoryMap = await resolveCategories(supabase, productIds);

        // Deduplicate by product_id+merchant_id (RPC can return same item for overlapping promo events)
        const seen = new Set<string>();
        const products = (data ?? [])
            .filter((row: any) => {
                const key = `${row.product_id}::${row.merchant_id}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .filter((row: any) => !category || categoryMap.get(row.product_id) === category)
            .map((row: any) => ({
                product_id: row.product_id,
                product_name: row.product_name,
                product_price: row.product_price,
                product_photo: row.product_photo,
                stock_quantity: row.stock_quantity,
                merchant_id: row.merchant_id,
                merchant_name: row.merchant_name,
                distance_km: row.distance_km,
                sale_price: row.sale_price,
                category: categoryMap.get(row.product_id) ?? null,
            }));

        return NextResponse.json({ products });
    }

    // trending & nearby both use the feed RPC — trending sorts by score, nearby by distance
    const { data, error } = await supabase.rpc("get_feed_nearby", {
        user_lat: lat,
        user_lng: lng,
        radius_km: radius,
        cursor_score: 999999,
        result_limit: 20,
    });

    if (error) {
        console.error(`[discover/${section}] RPC error:`, error.message);
        return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    let items = data ?? [];

    // Resolve categories for returned product IDs
    const productIds = items.map((r: any) => r.product_id);
    const categoryMap = await resolveCategories(supabase, productIds);

    // Deduplicate by product_id+merchant_id (feed can return same product for new_product + new_promo events)
    const seen = new Set<string>();
    items = items.filter((row: any) => {
        const key = `${row.product_id}::${row.merchant_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Filter by category if provided
    if (category) {
        items = items.filter((row: any) => categoryMap.get(row.product_id) === category);
    }

    // For "nearby", re-sort by distance instead of feed_score
    if (section === "nearby") {
        items = [...items].sort((a: any, b: any) => a.distance_km - b.distance_km);
    }

    const products = items.map((row: any) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        product_price: row.product_price,
        product_photo: row.product_photo,
        stock_quantity: row.stock_quantity,
        merchant_id: row.merchant_id,
        merchant_name: row.merchant_name,
        distance_km: row.distance_km,
        sale_price: null,
        category: categoryMap.get(row.product_id) ?? null,
    }));

    return NextResponse.json({ products });
}

/** Fetch categories for a list of product IDs in one query */
async function resolveCategories(
    supabase: any,
    productIds: string[],
): Promise<Map<string, string>> {
    if (productIds.length === 0) return new Map();
    const unique = [...new Set(productIds)];
    const { data } = await supabase
        .from("products")
        .select("id, category")
        .in("id", unique);
    const map = new Map<string, string>();
    for (const row of data ?? []) {
        if (row.category) map.set(row.id, row.category);
    }
    return map;
}

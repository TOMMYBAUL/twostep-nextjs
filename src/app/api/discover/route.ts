import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { discoverQuery, parseQuery } from "@/lib/validation";
import { captureError } from "@/lib/error";

export async function GET(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "discover", 60);
    if (limited) return limited;

    const parsed = parseQuery(request.nextUrl.searchParams, discoverQuery);
    if ("error" in parsed) return parsed.error;
    const { lat, lng, radius, section, category: rawCategory } = parsed.data;
    const category = rawCategory?.toLowerCase() ?? null;
    const size = request.nextUrl.searchParams.get("size") || null;
    const brand = request.nextUrl.searchParams.get("brand") || null;
    const color = request.nextUrl.searchParams.get("color") || null;
    const gender = request.nextUrl.searchParams.get("gender") || null;
    const priceMin = request.nextUrl.searchParams.get("priceMin") ? parseFloat(request.nextUrl.searchParams.get("priceMin")!) : null;
    const priceMax = request.nextUrl.searchParams.get("priceMax") ? parseFloat(request.nextUrl.searchParams.get("priceMax")!) : null;

    try {

    const supabase = await createClient();

    if (section === "promos") {
        const promoLimit = category ? 100 : 20;
        const { data, error } = await supabase.rpc("get_promos_nearby", {
            user_lat: lat,
            user_lng: lng,
            radius_km: radius,
            result_offset: 0,
            result_limit: promoLimit,
            filter_size: size,
        });

        if (error) {
            captureError(error, { route: "discover/promos" });
            return NextResponse.json({ error: "Query failed" }, { status: 500 });
        }

        // Resolve categories for returned product IDs
        const productIds = (data ?? []).map((r: any) => r.product_id);
        const categoryMap = await resolveCategories(supabase, productIds);

        // Deduplicate by product_id+merchant_id
        const seen = new Set<string>();
        let promoItems = (data ?? [])
            .filter((row: any) => {
                const key = `${row.product_id}::${row.merchant_id}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .filter((row: any) => !category || categoryMap.get(row.product_id)?.includes(category));

        // Apply brand/color/gender/price filters
        promoItems = await applyTagAndPriceFilters(supabase, promoItems, brand, color, gender, priceMin, priceMax);

        const products = promoItems.map((row: any) => ({
                product_id: row.product_id,
                product_name: row.product_name,
                product_price: row.product_price,
                product_photo: row.product_photo,
                stock_quantity: row.stock_quantity,
                merchant_id: row.merchant_id,
                merchant_name: row.merchant_name,
                distance_km: row.distance_km,
                sale_price: row.sale_price,
                category: categoryMap.get(row.product_id)?.[0] ?? null,
            }));

        return NextResponse.json({ products }, {
            headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" },
        });
    }

    // trending & nearby — size filter handled in RPC
    // Fetch more results when category filter is active (filtering happens post-RPC)
    const fetchLimit = category ? 100 : 20;
    const { data, error } = await supabase.rpc("get_feed_nearby", {
        user_lat: lat,
        user_lng: lng,
        radius_km: radius,
        cursor_score: 999999,
        result_limit: fetchLimit,
        filter_size: size,
    });

    if (error) {
        captureError(error, { route: `discover/${section}` });
        return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    let items = data ?? [];

    // Resolve categories, merchant photos, and active promotions
    const productIds = items.map((r: any) => r.product_id);
    const merchantIds = [...new Set<string>(items.map((r: any) => r.merchant_id))];
    const [categoryMap, merchantPhotoMap, promoMap] = await Promise.all([
        resolveCategories(supabase, productIds),
        resolveMerchantPhotos(supabase, merchantIds),
        resolveActivePromos(supabase, productIds),
    ]);

    // Deduplicate by product_id+merchant_id
    const seen = new Set<string>();
    items = items.filter((row: any) => {
        const key = `${row.product_id}::${row.merchant_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Filter by category if provided
    if (category) {
        items = items.filter((row: any) => categoryMap.get(row.product_id)?.includes(category));
    }

    // Apply brand/color/gender/price filters
    items = await applyTagAndPriceFilters(supabase, items, brand, color, gender, priceMin, priceMax);

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
        merchant_photo: merchantPhotoMap.get(row.merchant_id) ?? null,
        distance_km: row.distance_km,
        sale_price: row.sale_price ?? promoMap.get(row.product_id) ?? null,
        category: categoryMap.get(row.product_id)?.[0] ?? null,
    }));

    return NextResponse.json({ products }, {
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" },
    });

    } catch (err) {
        captureError(err, { route: "discover" });
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

/** Filter items by product_tags (brand/color/gender) and price range */
async function applyTagAndPriceFilters(
    supabase: any,
    items: any[],
    brand: string | null,
    color: string | null,
    gender: string | null,
    priceMin: number | null,
    priceMax: number | null,
): Promise<any[]> {
    if (!brand && !color && !gender && priceMin == null && priceMax == null) return items;

    let productIds = items.map((r: any) => r.product_id);

    // Tag filters: intersect matching IDs for each active filter
    if (brand || color || gender) {
        const tagFilters: { type: string; value: string }[] = [];
        if (brand) tagFilters.push({ type: "brand", value: brand });
        if (color) tagFilters.push({ type: "color", value: color });
        if (gender) tagFilters.push({ type: "gender", value: gender });

        for (const tf of tagFilters) {
            if (productIds.length === 0) break;
            const { data: tagData } = await supabase
                .from("product_tags")
                .select("product_id")
                .eq("tag_type", tf.type)
                .eq("tag_value", tf.value)
                .in("product_id", productIds);
            const matchIds = new Set((tagData ?? []).map((t: any) => t.product_id));
            items = items.filter((r: any) => matchIds.has(r.product_id));
            productIds = items.map((r: any) => r.product_id);
        }
    }

    // Price filters
    if (priceMin != null) {
        items = items.filter((r: any) => r.product_price >= priceMin);
    }
    if (priceMax != null) {
        items = items.filter((r: any) => r.product_price <= priceMax);
    }

    return items;
}

/** Fetch merchant photos for a list of merchant IDs in one query */
async function resolveMerchantPhotos(
    supabase: any,
    merchantIds: string[],
): Promise<Map<string, string>> {
    if (merchantIds.length === 0) return new Map();
    const { data } = await supabase
        .from("merchants")
        .select("id, photo_url")
        .in("id", merchantIds);
    const map = new Map<string, string>();
    for (const row of data ?? []) {
        if (row.photo_url) map.set(row.id, row.photo_url);
    }
    return map;
}

/** Fetch categories (primary + secondary) for a list of product IDs */
async function resolveCategories(
    supabase: any,
    productIds: string[],
): Promise<Map<string, string[]>> {
    if (productIds.length === 0) return new Map();
    const unique = [...new Set(productIds)];

    // Primary category + subcategory from products table
    const { data: products } = await supabase
        .from("products")
        .select("id, category, subcategory_id, categories!subcategory_id(slug)")
        .in("id", unique);

    const map = new Map<string, string[]>();
    for (const row of products ?? []) {
        const cats: string[] = [];
        if (row.category) cats.push(row.category.toLowerCase());
        const subSlug = (row as any).categories?.slug;
        if (subSlug) cats.push(subSlug.toLowerCase());
        if (cats.length > 0) map.set(row.id, cats);
    }

    // Secondary categories from product_tags
    const { data: tags } = await supabase
        .from("product_tags")
        .select("product_id, tag_value")
        .in("product_id", unique)
        .eq("tag_type", "category");

    for (const tag of tags ?? []) {
        const existing = map.get(tag.product_id) ?? [];
        const val = tag.tag_value.toLowerCase();
        if (!existing.includes(val)) {
            existing.push(val);
            map.set(tag.product_id, existing);
        }
    }

    return map;
}

/** Fetch active promotion sale_price for a list of product IDs */
async function resolveActivePromos(
    supabase: any,
    productIds: string[],
): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const unique = [...new Set(productIds)];
    const { data } = await supabase
        .from("promotions")
        .select("product_id, sale_price")
        .in("product_id", unique)
        .lte("starts_at", new Date().toISOString())
        .or("ends_at.is.null,ends_at.gt.now()");
    const map = new Map<string, number>();
    for (const row of data ?? []) {
        // Keep the lowest sale_price if multiple active promos
        const current = map.get(row.product_id);
        if (!current || row.sale_price < current) {
            map.set(row.product_id, row.sale_price);
        }
    }
    return map;
}

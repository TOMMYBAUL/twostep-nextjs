import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { searchQuery, parseQuery } from "@/lib/validation";

export async function GET(request: Request) {
    try {
        const limited = await rateLimit(request.headers.get("x-forwarded-for"), "search", 30);
        if (limited) return limited;

        const supabase = await createClient();
        const { searchParams } = new URL(request.url);

        const parsed = parseQuery(searchParams, searchQuery);
        if ("error" in parsed) return parsed.error;
        const { q: query, lat, lng, radius, limit } = parsed.data;
        const categoryFilter = searchParams.get("category") || null;

        const { data, error } = await supabase.rpc("search_products_nearby", {
            search_query: query,
            user_lat: lat,
            user_lng: lng,
            radius_km: radius,
            result_limit: limit,
        });

        if (error) {
            return NextResponse.json({ error: "Search failed" }, { status: 500 });
        }

        // Filter out variants, non-visible products, and optionally by category
        const productIds = (data ?? []).map((r: any) => r.product_id);
        let results = data ?? [];
        if (productIds.length > 0) {
            const { data: productMeta } = await supabase
                .from("products")
                .select("id, category, variant_of, visible")
                .in("id", [...new Set(productIds)]);
            const hiddenSet = new Set<string>();
            const categoryMap = new Map<string, string>();
            for (const p of productMeta ?? []) {
                if (p.variant_of || p.visible === false) hiddenSet.add(p.id);
                if (p.category) categoryMap.set(p.id, p.category);
            }
            results = results.filter((r: any) => !hiddenSet.has(r.product_id));
            if (categoryFilter) {
                results = results.filter((r: any) => categoryMap.get(r.product_id) === categoryFilter);
            }
        }

        return NextResponse.json({ results, count: results.length }, {
            headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

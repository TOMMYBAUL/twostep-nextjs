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

        return NextResponse.json({ results: data ?? [], count: data?.length ?? 0 }, {
            headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

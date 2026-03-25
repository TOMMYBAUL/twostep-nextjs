import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { nearbyQuery, parseQuery } from "@/lib/validation";

export async function GET(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "nearby", 30);
    if (limited) return limited;

    try {
        const parsed = parseQuery(request.nextUrl.searchParams, nearbyQuery);
        if ("error" in parsed) return parsed.error;
        const { lat, lng, radius, category, limit } = parsed.data;

        const supabase = await createClient();

        const { data, error } = await supabase.rpc("get_merchants_nearby", {
            user_lat: lat,
            user_lng: lng,
            radius_km: radius,
            category_filter: category ?? null,
            result_limit: limit,
        });

        if (error) {
            return NextResponse.json({ error: "Failed to fetch nearby merchants" }, { status: 500 });
        }

        return NextResponse.json({ merchants: data ?? [], count: data?.length ?? 0 }, {
            headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

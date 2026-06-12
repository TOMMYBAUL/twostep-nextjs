import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { feedQuery, parseQuery } from "@/lib/validation";
import { shouldShowOnMap } from "@/lib/onboarding/cold-start";

export async function GET(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "feed", 30);
    if (limited) return limited;

    try {
        const parsed = parseQuery(request.nextUrl.searchParams, feedQuery);
        if ("error" in parsed) return parsed.error;
        const { lat, lng, radius, cursor, limit } = parsed.data;

        const supabase = await createClient();

        const [feedRes, nearbyRes] = await Promise.all([
            supabase.rpc("get_feed_nearby", {
                user_lat: lat,
                user_lng: lng,
                radius_km: radius,
                cursor_score: cursor,
                result_limit: limit,
            }),
            // Même source de vérité que la carte : sert au filtre anti cold-start.
            supabase.rpc("get_merchants_nearby", {
                user_lat: lat,
                user_lng: lng,
                radius_km: radius,
                category_filter: null,
                result_limit: 500,
                filter_size: null,
            }),
        ]);
        const { data, error } = feedRes;

        if (error) {
            return NextResponse.json({ error: "Feed query failed" }, { status: 500 });
        }

        // Le curseur se calcule sur les données BRUTES pour ne pas casser la pagination.
        const nextCursor = data?.length === limit
            ? data[data.length - 1].feed_score
            : null;

        // Anti cold-start : pas d'événement feed pour une boutique en onboarding
        // (<3 produits visibles), cohérent avec la carte. Si le RPC annexe échoue,
        // on n'applique pas le filtre (confort UX, pas une barrière de sécurité).
        let items = data ?? [];
        if (nearbyRes.data) {
            const readyIds = new Set(
                nearbyRes.data
                    .filter((m: { product_count: number | string }) => shouldShowOnMap(Number(m.product_count)))
                    .map((m: { merchant_id: string }) => m.merchant_id),
            );
            items = items.filter((i: { merchant_id: string }) => readyIds.has(i.merchant_id));
        }

        return NextResponse.json({ items, next_cursor: nextCursor }, {
            headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

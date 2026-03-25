import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { feedQuery, parseQuery } from "@/lib/validation";

export async function GET(request: NextRequest) {
    const limited = rateLimit(request.headers.get("x-forwarded-for") ?? null, "feed", 30);
    if (limited) return limited;

    try {
        const parsed = parseQuery(request.nextUrl.searchParams, feedQuery);
        if ("error" in parsed) return parsed.error;
        const { lat, lng, radius, cursor, limit } = parsed.data;

        const supabase = await createClient();

        const { data, error } = await supabase.rpc("get_feed_nearby", {
            user_lat: lat,
            user_lng: lng,
            radius_km: radius,
            cursor_score: cursor,
            result_limit: limit,
        });

        if (error) {
            return NextResponse.json({ error: "Feed query failed" }, { status: 500 });
        }

        const nextCursor = data?.length === limit
            ? data[data.length - 1].feed_score
            : null;

        return NextResponse.json({ items: data ?? [], next_cursor: nextCursor });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

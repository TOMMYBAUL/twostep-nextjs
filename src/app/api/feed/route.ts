import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const lat = parseFloat(searchParams.get("lat") ?? "0");
    const lng = parseFloat(searchParams.get("lng") ?? "0");
    const radius = parseInt(searchParams.get("radius") ?? "10", 10);
    const cursor = parseFloat(searchParams.get("cursor") ?? "999999");
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);

    if (!lat || !lng) {
        return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_feed_nearby", {
        user_lat: lat,
        user_lng: lng,
        radius_km: radius,
        cursor_score: cursor,
        result_limit: limit,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const nextCursor = data?.length === limit
        ? data[data.length - 1].feed_score
        : null;

    return NextResponse.json({ items: data ?? [], next_cursor: nextCursor });
}

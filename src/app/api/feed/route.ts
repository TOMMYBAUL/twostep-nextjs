import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = request.nextUrl;
        const lat = parseFloat(searchParams.get("lat") ?? "");
        const lng = parseFloat(searchParams.get("lng") ?? "");
        const radius = Math.min(parseInt(searchParams.get("radius") ?? "10", 10), 50); // Cap at 50km
        const cursor = parseFloat(searchParams.get("cursor") ?? "999999");
        const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10), 1), 100); // 1-100

        if (isNaN(lat) || isNaN(lng)) {
            return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return NextResponse.json({ error: "lat must be [-90,90], lng must be [-180,180]" }, { status: 400 });
        }

        if (isNaN(cursor)) {
            return NextResponse.json({ error: "cursor must be a valid number" }, { status: 400 });
        }

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

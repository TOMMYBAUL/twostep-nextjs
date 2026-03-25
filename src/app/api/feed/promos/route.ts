import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "feed-promos", 30);
    if (limited) return limited;

    try {
        const { searchParams } = request.nextUrl;
        const lat = parseFloat(searchParams.get("lat") ?? "");
        const lng = parseFloat(searchParams.get("lng") ?? "");
        const radius = Math.min(parseInt(searchParams.get("radius") ?? "10", 10), 50);
        const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);
        const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10), 1), 100);

        if (isNaN(lat) || isNaN(lng)) {
            return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return NextResponse.json({ error: "lat must be [-90,90], lng must be [-180,180]" }, { status: 400 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase.rpc("get_promos_nearby", {
            user_lat: lat,
            user_lng: lng,
            radius_km: radius,
            result_offset: offset,
            result_limit: limit,
        });

        if (error) {
            return NextResponse.json({ error: "Promos query failed" }, { status: 500 });
        }

        return NextResponse.json(data ?? [], {
            headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

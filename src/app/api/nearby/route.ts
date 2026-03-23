import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const limited = rateLimit(request.headers.get("x-forwarded-for") ?? null, "nearby", 30);
    if (limited) return limited;

    try {
        const { searchParams } = request.nextUrl;
        const lat = parseFloat(searchParams.get("lat") ?? "");
        const lng = parseFloat(searchParams.get("lng") ?? "");
        const radius = parseInt(searchParams.get("radius") ?? "10", 10);
        const category = searchParams.get("category") || null;
        const limit = parseInt(searchParams.get("limit") ?? "50", 10);

        if (isNaN(lat) || isNaN(lng)) {
            return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return NextResponse.json({ error: "lat must be [-90,90], lng must be [-180,180]" }, { status: 400 });
        }

        if (isNaN(radius) || radius < 1) {
            return NextResponse.json({ error: "radius must be a positive number" }, { status: 400 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase.rpc("get_merchants_nearby", {
            user_lat: lat,
            user_lng: lng,
            radius_km: Math.min(radius, 50),
            category_filter: category,
            result_limit: Math.min(Math.max(limit, 1), 100),
        });

        if (error) {
            return NextResponse.json({ error: "Failed to fetch nearby merchants" }, { status: 500 });
        }

        return NextResponse.json({ merchants: data ?? [], count: data?.length ?? 0 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

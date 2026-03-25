import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
    try {
        const limited = rateLimit(request.headers.get("x-forwarded-for"), "search", 30);
        if (limited) return limited;

        const supabase = await createClient();
        const { searchParams } = new URL(request.url);

        const query = searchParams.get("q") ?? "";
        const lat = parseFloat(searchParams.get("lat") ?? "");
        const lng = parseFloat(searchParams.get("lng") ?? "");
        const radius = parseInt(searchParams.get("radius") ?? "5", 10);
        const limit = parseInt(searchParams.get("limit") ?? "50", 10);

        if (isNaN(lat) || isNaN(lng)) {
            return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return NextResponse.json({ error: "lat must be [-90,90], lng must be [-180,180]" }, { status: 400 });
        }

        if (query.length > 200) {
            return NextResponse.json({ error: "Search query too long (max 200 characters)" }, { status: 400 });
        }

        const { data, error } = await supabase.rpc("search_products_nearby", {
            search_query: query,
            user_lat: lat,
            user_lng: lng,
            radius_km: Math.min(Math.max(radius, 1), 50),
            result_limit: Math.min(Math.max(limit, 1), 100),
        });

        if (error) {
            return NextResponse.json({ error: "Search failed" }, { status: 500 });
        }

        return NextResponse.json({ results: data ?? [], count: data?.length ?? 0 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

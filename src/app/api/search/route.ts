import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
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

    const { data, error } = await supabase.rpc("search_products_nearby", {
        search_query: query,
        user_lat: lat,
        user_lng: lng,
        radius_km: Math.min(radius, 50),
        result_limit: Math.min(limit, 100),
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ results: data, count: data?.length ?? 0 });
}

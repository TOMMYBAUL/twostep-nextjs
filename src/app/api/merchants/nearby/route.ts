import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    const radius = parseInt(searchParams.get("radius") ?? "10", 10);
    const category = searchParams.get("category") || null;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    if (isNaN(lat) || isNaN(lng)) {
        return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_merchants_nearby", {
        user_lat: lat,
        user_lng: lng,
        radius_km: Math.min(radius, 50),
        category_filter: category,
        result_limit: Math.min(limit, 100),
    });

    if (error) {
        return NextResponse.json({ error: "Failed to fetch nearby merchants" }, { status: 500 });
    }

    return NextResponse.json({ merchants: data ?? [], count: data?.length ?? 0 });
}

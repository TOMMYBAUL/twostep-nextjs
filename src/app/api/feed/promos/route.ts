import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const lat = parseFloat(searchParams.get("lat") ?? "0");
    const lng = parseFloat(searchParams.get("lng") ?? "0");
    const radius = parseInt(searchParams.get("radius") ?? "10", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);

    if (!lat || !lng) {
        return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_promos_nearby", {
        user_lat: lat,
        user_lng: lng,
        radius_km: radius,
        result_offset: offset,
        result_limit: limit,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data ?? []);
}

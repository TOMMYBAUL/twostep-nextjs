import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
        .from("merchants")
        .select("id, name, address, city, pos_type, pos_last_sync, created_at")
        .eq("user_id", user.id)
        .single();

    if (error && error.code !== "PGRST116") {
        return NextResponse.json({ error: "Failed to fetch merchant" }, { status: 500 });
    }

    return NextResponse.json({ merchant: data });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, address, city, lat, lng } = body;

    if (!name || !address || !city || lat == null || lng == null) {
        return NextResponse.json(
            { error: "Missing required fields: name, address, city, lat, lng" },
            { status: 400 },
        );
    }

    if (typeof lat !== "number" || typeof lng !== "number" || !isFinite(lat) || !isFinite(lng)) {
        return NextResponse.json({ error: "lat and lng must be valid numbers" }, { status: 400 });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return NextResponse.json({ error: "lat must be [-90,90], lng must be [-180,180]" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("merchants")
        .insert({
            user_id: user.id,
            name,
            address,
            city,
            location: `SRID=4326;POINT(${lng} ${lat})`,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: "Failed to create merchant" }, { status: 500 });
    }

    return NextResponse.json({ merchant: data }, { status: 201 });
}

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("merchants")
        .select("id, name, address, city, pos_type, pos_last_sync, created_at")
        .eq("id", id)
        .single();

    if (error) {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    return NextResponse.json({ merchant: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, address, city, lat, lng } = body;

    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (address) updates.address = address;
    if (city) updates.city = city;
    if (lat != null && lng != null) {
        if (typeof lat !== "number" || typeof lng !== "number" || !isFinite(lat) || !isFinite(lng)) {
            return NextResponse.json({ error: "lat and lng must be valid numbers" }, { status: 400 });
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return NextResponse.json({ error: "lat must be [-90,90], lng must be [-180,180]" }, { status: 400 });
        }
        updates.location = `SRID=4326;POINT(${lng} ${lat})`;
    }

    const { data, error } = await supabase
        .from("merchants")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: "Operation failed" }, { status: 500 });
    }

    return NextResponse.json({ merchant: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
        .from("merchants")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) {
        return NextResponse.json({ error: "Operation failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("merchants")
        .select("*")
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
    const { name, address, city, lat, lng, phone, description, photo_url, opening_hours } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (address !== undefined) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (phone !== undefined) updates.phone = phone;
    if (description !== undefined) updates.description = description;
    if (photo_url !== undefined) updates.photo_url = photo_url;
    if (opening_hours !== undefined) updates.opening_hours = opening_hours;
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

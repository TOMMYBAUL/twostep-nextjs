import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Public fields safe to expose — no internal IDs, tokens, or private data
const PUBLIC_FIELDS = "id, name, address, city, location, phone, description, photo_url, opening_hours, pos_type, status, created_at";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid merchant ID" }, { status: 400 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from("merchants")
            .select(PUBLIC_FIELDS)
            .eq("id", id)
            .single();

        if (error) {
            return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
        }

        return NextResponse.json({ merchant: data });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid merchant ID" }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { name, address, city, lat, lng, phone, description, photo_url, opening_hours } = body;

        const updates: Record<string, unknown> = {};
        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
            }
            updates.name = name;
        }
        if (address !== undefined) {
            if (typeof address !== "string") {
                return NextResponse.json({ error: "address must be a string" }, { status: 400 });
            }
            updates.address = address;
        }
        if (city !== undefined) {
            if (typeof city !== "string") {
                return NextResponse.json({ error: "city must be a string" }, { status: 400 });
            }
            updates.city = city;
        }
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

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
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

        if (!data) {
            return NextResponse.json({ error: "Merchant not found or unauthorized" }, { status: 404 });
        }

        return NextResponse.json({ merchant: data });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid merchant ID" }, { status: 400 });
        }

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
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

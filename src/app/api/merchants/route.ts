import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "merchants", 30);
    if (limited) return limited;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data, error } = await supabase
            .from("merchants")
            .select("*")
            .eq("user_id", user.id)
            .single();

        if (error && error.code !== "PGRST116") {
            return NextResponse.json({ error: "Failed to fetch merchant" }, { status: 500 });
        }

        return NextResponse.json({ merchant: data }, {
            headers: { "Cache-Control": "private, max-age=60" },
        });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "merchants", 30);
    if (limited) return limited;

    try {
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

        const { name, address, city, siret, phone, description, photo_url, opening_hours } = body;
        const lat: number = typeof body.lat === "number" ? body.lat : 48.8566;
        const lng: number = typeof body.lng === "number" ? body.lng : 2.3522;

        if (!name || typeof name !== "string") {
            return NextResponse.json({ error: "name is required and must be a string" }, { status: 400 });
        }
        if (!address || typeof address !== "string") {
            return NextResponse.json({ error: "address is required and must be a string" }, { status: 400 });
        }
        if (!city || typeof city !== "string") {
            return NextResponse.json({ error: "city is required and must be a string" }, { status: 400 });
        }

        if (siret !== undefined && siret !== null && typeof siret !== "string") {
            return NextResponse.json({ error: "siret must be a string" }, { status: 400 });
        }

        if (!isFinite(lat) || !isFinite(lng)) {
            return NextResponse.json({ error: "lat and lng must be valid numbers" }, { status: 400 });
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return NextResponse.json({ error: "lat must be [-90,90], lng must be [-180,180]" }, { status: 400 });
        }

        // Geocode address if coordinates are missing (0,0)
        let finalLat = lat;
        let finalLng = lng;
        if (lat === 0 && lng === 0 && address && city) {
            const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
            if (mapboxToken) {
                try {
                    const query = encodeURIComponent(`${address}, ${city}, France`);
                    const geoRes = await fetch(
                        `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&limit=1&country=FR`,
                    );
                    if (geoRes.ok) {
                        const geoData = await geoRes.json();
                        const coords = geoData.features?.[0]?.center;
                        if (coords) {
                            finalLng = coords[0];
                            finalLat = coords[1];
                        }
                    }
                } catch {
                    // Geocoding failed — use defaults (Toulouse center)
                    finalLat = 43.6047;
                    finalLng = 1.4442;
                }
            }
        }

        const { data, error } = await supabase
            .from("merchants")
            .insert({
                user_id: user.id,
                name,
                address,
                city,
                location: `SRID=4326;POINT(${finalLng} ${finalLat})`,
                siret: siret ?? null,
                phone: phone ?? null,
                description: description ?? null,
                photo_url: photo_url ?? null,
                opening_hours: opening_hours ?? null,
                status: "pending",
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: "Failed to create merchant" }, { status: 500 });
        }

        return NextResponse.json({ merchant: data }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

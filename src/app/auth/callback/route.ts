import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next");

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const meta = user.user_metadata ?? {};
                if (meta.role === "merchant" && meta.merchant_name) {
                    const { data: existing } = await supabase
                        .from("merchants")
                        .select("id")
                        .eq("user_id", user.id)
                        .maybeSingle();

                    if (!existing) {
                        const address = (meta.merchant_address as string) ?? "";
                        const city = (meta.merchant_city as string) ?? "";
                        let lat = 43.6047;
                        let lng = 1.4442;
                        const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
                        if (mapboxToken && address && city) {
                            try {
                                const query = encodeURIComponent(`${address}, ${city}, France`);
                                const geoRes = await fetch(
                                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&limit=1&country=FR`,
                                );
                                if (geoRes.ok) {
                                    const coords = (await geoRes.json()).features?.[0]?.center;
                                    if (coords) { lng = coords[0]; lat = coords[1]; }
                                }
                            } catch {
                                // keep Toulouse center fallback
                            }
                        }

                        await supabase.from("merchants").insert({
                            user_id: user.id,
                            name: meta.merchant_name,
                            address,
                            city,
                            location: `SRID=4326;POINT(${lng} ${lat})`,
                            siret: (meta.merchant_siret as string) ?? null,
                            phone: (meta.merchant_phone as string) ?? null,
                            status: meta.merchant_siret_pending ? "pending" : "active",
                        });
                    }
                }
            }

            if (next && next.startsWith("/")) {
                return NextResponse.redirect(`${origin}${next}`);
            }

            let dest = "/discover";
            if (user) {
                const { data: merchant } = await supabase
                    .from("merchants")
                    .select("id")
                    .eq("user_id", user.id)
                    .maybeSingle();
                if (merchant) dest = "/dashboard";
            }
            return NextResponse.redirect(`${origin}${dest}`);
        }
        return NextResponse.redirect(`${origin}/auth/error?reason=${encodeURIComponent(error.message)}`);
    }

    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
}

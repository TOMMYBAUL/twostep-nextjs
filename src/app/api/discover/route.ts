import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_SECTIONS = ["promos", "trending", "nearby"] as const;
type Section = (typeof VALID_SECTIONS)[number];

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const lat = parseFloat(searchParams.get("lat") ?? "0");
    const lng = parseFloat(searchParams.get("lng") ?? "0");
    const radius = Math.min(parseInt(searchParams.get("radius") ?? "10", 10), 50);
    const section = searchParams.get("section") as Section | null;

    if (!lat || !lng) {
        return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    if (!section || !VALID_SECTIONS.includes(section)) {
        return NextResponse.json({ error: "section must be one of: promos, trending, nearby" }, { status: 400 });
    }

    const supabase = await createClient();

    if (section === "promos") {
        const { data, error } = await supabase.rpc("get_promos_nearby", {
            user_lat: lat,
            user_lng: lng,
            radius_km: radius,
            result_offset: 0,
            result_limit: 20,
        });

        if (error) {
            console.error("[discover/promos] RPC error:", error.message);
            return NextResponse.json({ error: "Query failed" }, { status: 500 });
        }

        const products = (data ?? []).map((row: any) => ({
            product_id: row.product_id,
            product_name: row.product_name,
            product_price: row.product_price,
            product_photo: row.product_photo,
            stock_quantity: row.stock_quantity,
            merchant_id: row.merchant_id,
            merchant_name: row.merchant_name,
            distance_km: row.distance_km,
            sale_price: row.sale_price,
        }));

        return NextResponse.json({ products });
    }

    // trending & nearby both use the feed RPC — trending sorts by score, nearby by distance
    const { data, error } = await supabase.rpc("get_feed_nearby", {
        user_lat: lat,
        user_lng: lng,
        radius_km: radius,
        cursor_score: 999999,
        result_limit: 20,
    });

    if (error) {
        console.error(`[discover/${section}] RPC error:`, error.message);
        return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    let items = data ?? [];

    // For "nearby", re-sort by distance instead of feed_score
    if (section === "nearby") {
        items = [...items].sort((a: any, b: any) => a.distance_km - b.distance_km);
    }

    const products = items.map((row: any) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        product_price: row.product_price,
        product_photo: row.product_photo,
        stock_quantity: row.stock_quantity,
        merchant_id: row.merchant_id,
        merchant_name: row.merchant_name,
        distance_km: row.distance_km,
        sale_price: null,
    }));

    return NextResponse.json({ products });
}

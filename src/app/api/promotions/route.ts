import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get("merchant_id");

    if (merchantId) {
        // Filter by merchant: get product IDs first, then fetch their promotions
        const { data: products } = await supabase.from("products").select("id").eq("merchant_id", merchantId);
        const productIds = (products ?? []).map((p) => p.id);

        if (productIds.length === 0) {
            return NextResponse.json({ promotions: [] });
        }

        const { data, error } = await supabase
            .from("promotions")
            .select("*, products(name, price, photo_url, merchant_id)")
            .in("product_id", productIds)
            .or("ends_at.is.null,ends_at.gt.now()")
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ promotions: data });
    }

    const { data, error } = await supabase
        .from("promotions")
        .select("*, products(name, price, photo_url, merchant_id)")
        .or("ends_at.is.null,ends_at.gt.now()")
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ promotions: data });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { product_id, sale_price, starts_at, ends_at } = body;

    if (!product_id || sale_price == null) {
        return NextResponse.json({ error: "product_id and sale_price required" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("promotions")
        .insert({
            product_id,
            sale_price,
            starts_at: starts_at ?? new Date().toISOString(),
            ends_at: ends_at ?? null,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ promotion: data }, { status: 201 });
}

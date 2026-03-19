import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get("merchant_id");

    if (!merchantId) {
        return NextResponse.json({ error: "merchant_id required" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("products")
        .select("*, stock(quantity)")
        .eq("merchant_id", merchantId)
        .order("name");

    if (error) {
        return NextResponse.json({ error: "Operation failed" }, { status: 500 });
    }

    return NextResponse.json({ products: data });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Derive merchant_id from authenticated user (prevents spoofing)
    const { data: merchant } = await supabase.from("merchants").select("id").eq("user_id", user.id).single();

    if (!merchant) {
        return NextResponse.json({ error: "No merchant profile found. Create one first." }, { status: 403 });
    }

    const body = await request.json();
    const { name, ean, description, category, price, photo_url, initial_quantity } = body;

    if (!name) {
        return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
    }

    if (price !== undefined && (typeof price !== "number" || price < 0)) {
        return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
    }

    // Insert product
    const { data: product, error: productError } = await supabase
        .from("products")
        .insert({ merchant_id: merchant.id, name, ean, description, category, price, photo_url })
        .select()
        .single();

    if (productError) {
        return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
    }

    // Insert initial stock
    const { error: stockError } = await supabase
        .from("stock")
        .insert({ product_id: product.id, quantity: initial_quantity ?? 0 });

    if (stockError) {
        return NextResponse.json({ error: "Failed to initialize stock" }, { status: 500 });
    }

    return NextResponse.json({ product }, { status: 201 });
}

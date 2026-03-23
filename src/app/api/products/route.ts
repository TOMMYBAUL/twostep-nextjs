import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const merchantId = searchParams.get("merchant_id");

        if (!merchantId || typeof merchantId !== "string") {
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

        return NextResponse.json({ products: data ?? [] });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
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

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { name, ean, description, category, price, photo_url, initial_quantity } = body;

        if (!name || typeof name !== "string") {
            return NextResponse.json({ error: "name is required and must be a string" }, { status: 400 });
        }

        if (price !== undefined && price !== null && (typeof price !== "number" || price < 0)) {
            return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
        }

        if (initial_quantity !== undefined && initial_quantity !== null && (typeof initial_quantity !== "number" || initial_quantity < 0 || !Number.isInteger(initial_quantity))) {
            return NextResponse.json({ error: "initial_quantity must be a non-negative integer" }, { status: 400 });
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

        // Emit feed_event for new product
        const adminSupabase = createAdminClient();
        await adminSupabase.from("feed_events").insert({
            merchant_id: merchant.id,
            product_id: product.id,
            event_type: "new_product",
        });

        return NextResponse.json({ product }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

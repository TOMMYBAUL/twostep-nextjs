import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
    try {
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
                return NextResponse.json({ error: "Operation failed" }, { status: 500 });
            }

            return NextResponse.json({ promotions: data ?? [] });
        }

        const { data, error } = await supabase
            .from("promotions")
            .select("*, products(name, price, photo_url, merchant_id)")
            .or("ends_at.is.null,ends_at.gt.now()")
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: "Operation failed" }, { status: 500 });
        }

        return NextResponse.json({ promotions: data ?? [] });
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

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { product_id, sale_price, starts_at, ends_at } = body;

        if (!product_id || typeof product_id !== "string") {
            return NextResponse.json({ error: "product_id is required and must be a string" }, { status: 400 });
        }

        if (sale_price == null || typeof sale_price !== "number" || sale_price <= 0) {
            return NextResponse.json({ error: "sale_price must be a positive number" }, { status: 400 });
        }

        if (starts_at !== undefined && typeof starts_at !== "string") {
            return NextResponse.json({ error: "starts_at must be an ISO date string" }, { status: 400 });
        }

        if (ends_at !== undefined && ends_at !== null && typeof ends_at !== "string") {
            return NextResponse.json({ error: "ends_at must be an ISO date string or null" }, { status: 400 });
        }

        // Verify ownership: product must belong to user's merchant
        const { data: product } = await supabase
            .from("products")
            .select("merchant_id, merchants!inner(user_id)")
            .eq("id", product_id)
            .single();

        if (!product || (product as any).merchants?.user_id !== user.id) {
            return NextResponse.json({ error: "Product not found or unauthorized" }, { status: 404 });
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
            return NextResponse.json({ error: "Failed to create promotion" }, { status: 500 });
        }

        // Emit feed_event for new promo (product already verified above)
        {
            const adminSupabase = createAdminClient();
            await adminSupabase.from("feed_events").insert({
                merchant_id: product.merchant_id,
                product_id,
                event_type: "new_promo",
            });
        }

        return NextResponse.json({ promotion: data }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from("products")
            .select("*, stock(quantity), promotions(*)")
            .eq("id", id)
            .single();

        if (error) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        return NextResponse.json({ product: data });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
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

        const { name, ean, description, category, price, photo_url } = body;

        const updates: Record<string, unknown> = {};
        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
            }
            updates.name = name;
        }
        if (ean !== undefined) updates.ean = ean;
        if (description !== undefined) updates.description = description;
        if (category !== undefined) updates.category = category;
        if (price !== undefined) {
            if (typeof price !== "number" || price < 0) {
                return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
            }
            updates.price = price;
        }
        if (photo_url !== undefined) updates.photo_url = photo_url;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
        }

        // Verify ownership: product must belong to a merchant owned by this user
        const { data: product } = await supabase
            .from("products")
            .select("merchant_id, price, merchants!inner(user_id)")
            .eq("id", id)
            .single();

        if (!product || (product as any).merchants?.user_id !== user.id) {
            return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
        }

        const { data, error } = await supabase.from("products").update(updates).eq("id", id).select().single();

        if (error) {
            return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
        }

        // Emit price_drop event if price decreased
        if (product && body.price && product.price && body.price < product.price) {
            const adminSupabase = createAdminClient();
            await adminSupabase.from("feed_events").insert({
                merchant_id: product.merchant_id,
                product_id: id,
                event_type: "price_drop",
            });
        }

        return NextResponse.json({ product: data });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Verify ownership: product must belong to a merchant owned by this user
        const { data: product } = await supabase
            .from("products")
            .select("id, merchants!inner(user_id)")
            .eq("id", id)
            .single();

        if (!product || (product as any).merchants?.user_id !== user.id) {
            return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
        }

        const { error } = await supabase.from("products").delete().eq("id", id);

        if (error) {
            return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { product_id, quantity, delta } = body;

    if (!product_id) {
        return NextResponse.json({ error: "product_id required" }, { status: 400 });
    }

    // Verify ownership: product must belong to a merchant owned by this user
    const { data: product } = await supabase
        .from("products")
        .select("merchant_id, merchants!inner(user_id)")
        .eq("id", product_id)
        .single();

    if (!product || (product as any).merchants?.user_id !== user.id) {
        return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    if (delta !== undefined) {
        // Read current stock (may not exist yet for POS-synced products)
        const { data: current } = await supabase
            .from("stock")
            .select("quantity")
            .eq("product_id", product_id)
            .maybeSingle();

        const newQty = Math.max(0, (current?.quantity ?? 0) + delta);

        // Upsert: creates the row if missing, updates if exists
        const { data, error } = await supabase
            .from("stock")
            .upsert({ product_id, quantity: newQty })
            .select()
            .single();

        if (error) return NextResponse.json({ error: "Operation failed" }, { status: 500 });
        return NextResponse.json({ stock: data });
    }

    if (quantity !== undefined) {
        // Absolute update (e.g., invoice import)
        const { data, error } = await supabase
            .from("stock")
            .upsert({ product_id, quantity: Math.max(0, quantity) })
            .select()
            .single();

        if (error) return NextResponse.json({ error: "Operation failed" }, { status: 500 });
        return NextResponse.json({ stock: data });
    }

    return NextResponse.json({ error: "quantity or delta required" }, { status: 400 });
}

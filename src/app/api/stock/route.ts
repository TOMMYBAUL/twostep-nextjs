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
        // Atomic relative update via RPC (prevents race conditions from concurrent webhooks)
        const { data: newQty, error } = await supabase.rpc("update_stock_delta", {
            p_product_id: product_id,
            p_delta: delta,
        });

        if (error) return NextResponse.json({ error: "Operation failed" }, { status: 500 });
        return NextResponse.json({ stock: { product_id, quantity: newQty } });
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

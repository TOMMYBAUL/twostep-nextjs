import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateStockAtomic } from "@/lib/pos/update-stock";
import { rateLimit } from "@/lib/rate-limit";

export async function PATCH(request: NextRequest) {
    try {
        const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "stock", 30);
        if (limited) return limited;

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

        const { product_id, quantity, delta } = body;

        if (!product_id || typeof product_id !== "string") {
            return NextResponse.json({ error: "product_id required and must be a string" }, { status: 400 });
        }

        if (delta !== undefined && typeof delta !== "number") {
            return NextResponse.json({ error: "delta must be a number" }, { status: 400 });
        }

        if (quantity !== undefined && (typeof quantity !== "number" || quantity < 0)) {
            return NextResponse.json({ error: "quantity must be a non-negative number" }, { status: 400 });
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

        const admin = createAdminClient();

        if (delta !== undefined) {
            // Atomic delta update — no TOCTOU race condition
            const previousQty = await updateStockAtomic(admin, product_id, delta, "delta");
            const newQty = Math.max(0, previousQty + delta);

            // Restock event: produit remis en stock (0 → N)
            if (previousQty === 0 && newQty > 0) {
                await admin.from("feed_events").insert({
                    merchant_id: (product as any).merchant_id,
                    product_id,
                    event_type: "restock",
                });
            }

            return NextResponse.json({ stock: { product_id, quantity: newQty } });
        }

        if (quantity !== undefined) {
            // Absolute update
            const previousQty = await updateStockAtomic(admin, product_id, quantity as number, "absolute");
            const newQty = Math.max(0, quantity as number);

            // Restock event: produit remis en stock (0 → N)
            if (previousQty === 0 && newQty > 0) {
                await admin.from("feed_events").insert({
                    merchant_id: (product as any).merchant_id,
                    product_id,
                    event_type: "restock",
                });
            }

            return NextResponse.json({ stock: { product_id, quantity: newQty } });
        }

        return NextResponse.json({ error: "quantity or delta required" }, { status: 400 });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

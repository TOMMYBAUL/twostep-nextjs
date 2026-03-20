import { NextResponse } from "next/server";

import { squareAdapter } from "@/lib/pos/square";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
    const body = await request.text();
    const signature = request.headers.get("x-square-hmacsha256-signature") || "";

    // Verify webhook signature
    if (!squareAdapter.verifyWebhook(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    let event: Record<string, unknown>;
    try {
        event = JSON.parse(body);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates = squareAdapter.parseWebhookEvent(event);
    if (!updates || updates.length === 0) {
        // Acknowledge unhandled event types
        return NextResponse.json({ ok: true });
    }

    try {
        // Webhooks bypass RLS — use admin client
        const supabase = createAdminClient();

        for (const update of updates) {
            // Find product by pos_item_id
            const { data: product } = await supabase
                .from("products")
                .select("id, merchant_id")
                .eq("pos_item_id", update.pos_item_id)
                .single();

            if (!product) continue;

            // Atomic stock update
            await supabase.from("stock").upsert({
                product_id: product.id,
                quantity: Math.max(0, update.quantity),
            });

            // Emit restock feed_event
            await supabase.from("feed_events").insert({
                merchant_id: product.merchant_id,
                product_id: product.id,
                event_type: "restock",
            });
        }

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}

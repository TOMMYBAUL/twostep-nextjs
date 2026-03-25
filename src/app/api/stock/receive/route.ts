import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/stock/receive
 * Merchant confirms they received the delivery.
 * Moves stock from "incoming" to actual available stock.
 *
 * Body: { incoming_ids: string[] }  — IDs from stock_incoming table
 *   OR: { invoice_id: string }      — confirm ALL incoming from one invoice
 */
export async function POST(request: NextRequest) {
    try {
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { incoming_ids, invoice_id } = body;

    if (incoming_ids !== undefined && (!Array.isArray(incoming_ids) || incoming_ids.length === 0)) {
        return NextResponse.json({ error: "incoming_ids must be a non-empty array" }, { status: 400 });
    }

    if (invoice_id !== undefined && typeof invoice_id !== "string") {
        return NextResponse.json({ error: "invoice_id must be a string" }, { status: 400 });
    }

    // Fetch incoming stock items
    let query = adminSupabase
        .from("stock_incoming")
        .select("*, products!inner(merchant_id)")
        .eq("status", "incoming");

    if (incoming_ids?.length) {
        query = query.in("id", incoming_ids);
    } else if (invoice_id) {
        query = query.eq("invoice_id", invoice_id);
    } else {
        return NextResponse.json({ error: "Provide incoming_ids or invoice_id" }, { status: 400 });
    }

    const { data: incomingItems } = await query;

    if (!incomingItems?.length) {
        return NextResponse.json({ error: "No incoming stock found" }, { status: 404 });
    }

    // Verify ownership
    const unauthorized = incomingItems.some(
        (item: { products: { merchant_id: string } }) => item.products.merchant_id !== merchant.id
    );
    if (unauthorized) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    let received = 0;

    for (const item of incomingItems) {
        // Atomic: update stock + mark received + create feed event
        await adminSupabase.rpc("receive_stock_incoming", {
            p_incoming_id: item.id,
            p_product_id: item.product_id,
            p_delta: item.quantity,
            p_merchant_id: merchant.id,
        });

        received++;
    }

    return NextResponse.json({ received });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

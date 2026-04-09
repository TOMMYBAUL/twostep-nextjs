import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/stock/incoming
 * List pending deliveries (stock_incoming with status "incoming")
 * grouped by invoice for the current merchant.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

        const { data: incoming, error } = await supabase
            .from("stock_incoming")
            .select("id, quantity, status, created_at, invoice_id, product_id, products!inner(id, name, merchant_id)")
            .eq("status", "incoming")
            .eq("products.merchant_id", merchant.id)
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: "Failed to fetch incoming stock" }, { status: 500 });
        }

        return NextResponse.json({ incoming: incoming ?? [] });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

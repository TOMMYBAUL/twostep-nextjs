import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Verify ownership: invoice → merchant → user
        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();
        if (!merchant) return NextResponse.json({ error: "No merchant profile" }, { status: 403 });

        const { data: invoice, error } = await supabase
            .from("invoices")
            .select("*, invoice_items(*)")
            .eq("id", id)
            .eq("merchant_id", merchant.id)
            .single();

        if (error || !invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

        return NextResponse.json(invoice);
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Verify ownership: invoice → merchant → user
        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();
        if (!merchant) return NextResponse.json({ error: "No merchant profile" }, { status: 403 });

        // Verify the invoice belongs to this merchant
        const { data: existing } = await supabase
            .from("invoices")
            .select("id")
            .eq("id", id)
            .eq("merchant_id", merchant.id)
            .single();
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        if (body.items !== undefined && !Array.isArray(body.items)) {
            return NextResponse.json({ error: "items must be an array" }, { status: 400 });
        }

        if (body.items && Array.isArray(body.items)) {
            for (const item of body.items) {
                if (!item || typeof item !== "object" || !item.id) {
                    return NextResponse.json({ error: "Each item must have an id" }, { status: 400 });
                }

                if (item.quantity !== undefined && (typeof item.quantity !== "number" || item.quantity < 0)) {
                    return NextResponse.json({ error: "item quantity must be a non-negative number" }, { status: 400 });
                }

                if (item.unit_price_ht !== undefined && (typeof item.unit_price_ht !== "number" || item.unit_price_ht < 0)) {
                    return NextResponse.json({ error: "item unit_price_ht must be a non-negative number" }, { status: 400 });
                }

                // Only update items belonging to this invoice
                await supabase
                    .from("invoice_items")
                    .update({
                        name: item.name,
                        quantity: item.quantity,
                        unit_price_ht: item.unit_price_ht,
                        ean: item.ean,
                        status: item.status,
                    })
                    .eq("id", item.id)
                    .eq("invoice_id", id);
            }
        }

        const { data: invoice } = await supabase
            .from("invoices")
            .select("*, invoice_items(*)")
            .eq("id", id)
            .eq("merchant_id", merchant.id)
            .single();

        return NextResponse.json(invoice);
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

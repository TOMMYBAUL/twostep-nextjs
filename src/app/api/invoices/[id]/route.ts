import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: invoice, error } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .eq("id", id)
        .single();

    if (error || !invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(invoice);
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (body.items && Array.isArray(body.items)) {
        for (const item of body.items) {
            await supabase
                .from("invoice_items")
                .update({
                    name: item.name,
                    quantity: item.quantity,
                    unit_price_ht: item.unit_price_ht,
                    ean: item.ean,
                    status: item.status,
                })
                .eq("id", item.id);
        }
    }

    const { data: invoice } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .eq("id", id)
        .single();

    return NextResponse.json(invoice);
}

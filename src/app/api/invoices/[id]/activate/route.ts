import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activateInvoice } from "@/lib/invoice/activate";
import { captureError } from "@/lib/error";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const limited = await rateLimit(_request.headers.get("x-forwarded-for") ?? null, "invoices:activate", 5);
    if (limited) return limited;

    try {
        const { id } = await params;

        // Auth check
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Verify merchant owns this invoice
        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
        }

        const { data: invoice } = await supabase
            .from("invoices")
            .select("merchant_id")
            .eq("id", id)
            .single();

        if (!invoice || invoice.merchant_id !== merchant.id) {
            return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        }

        const result = await activateInvoice(id);

        return NextResponse.json(result);
    } catch (e) {
        captureError(e, { route: "invoices/[id]/activate" });
        return NextResponse.json(
            { error: "Activation failed" },
            { status: 500 },
        );
    }
}

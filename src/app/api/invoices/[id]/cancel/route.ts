import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { captureError } from "@/lib/error";

const UNDO_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "invoices:cancel", 10);
    if (limited) return limited;

    const { id } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 403 });

    const { data: invoice } = await supabase
        .from("invoices")
        .select("id, merchant_id, status, validated_at, kind")
        .eq("id", id)
        .maybeSingle();
    if (!invoice || invoice.merchant_id !== merchant.id) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.kind === "correction") {
        return NextResponse.json({ error: "Cannot cancel a corrective invoice" }, { status: 400 });
    }
    if (invoice.status !== "imported" && invoice.status !== "validated") {
        return NextResponse.json({ error: "Invoice not validated yet — nothing to cancel" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch invoice items to know the stock delta to reverse
    const { data: items } = await admin
        .from("invoice_items")
        .select("id, product_id, quantity, received_qty, status")
        .eq("invoice_id", id);

    const activeItems = (items ?? []).filter((i) => i.status !== "rejected" && i.product_id);
    const stockDeltas = new Map<string, number>();
    for (const it of activeItems) {
        const qty = (it.received_qty ?? it.quantity) as number;
        if (!it.product_id || !qty) continue;
        stockDeltas.set(it.product_id as string, (stockDeltas.get(it.product_id as string) ?? 0) + qty);
    }

    const validatedAt = invoice.validated_at ? new Date(invoice.validated_at).getTime() : 0;
    const insideWindow = validatedAt > 0 && Date.now() - validatedAt < UNDO_WINDOW_MS;

    try {
        if (insideWindow) {
            // Hard cancel: decrement stock, reset invoice to pending, clear validated_at
            for (const [productId, delta] of stockDeltas) {
                await admin.rpc("increment_stock_quantity", { p_product_id: productId, p_delta: -delta })
                    .then(async (res) => {
                        // If RPC not available, fallback to direct update
                        if (res.error) {
                            const { data: current } = await admin
                                .from("stock")
                                .select("quantity")
                                .eq("product_id", productId)
                                .maybeSingle();
                            const next = Math.max(0, (current?.quantity ?? 0) - delta);
                            await admin.from("stock").update({ quantity: next }).eq("product_id", productId);
                        }
                    });
            }
            await admin
                .from("invoices")
                .update({ status: "parsed", validated_at: null, ux_status: "pending" })
                .eq("id", id);
            return NextResponse.json({ mode: "hard_undo" });
        }

        // Beyond window: create a corrective negative invoice
        const { data: corrective, error: createErr } = await admin
            .from("invoices")
            .insert({
                merchant_id: merchant.id,
                supplier_name: "Correction",
                status: "imported",
                kind: "correction",
                corrects_invoice_id: id,
                received_at: new Date().toISOString(),
                validated_at: new Date().toISOString(),
                ux_status: "validated",
            })
            .select("id")
            .single();
        if (createErr || !corrective) throw createErr ?? new Error("Failed to create corrective invoice");

        for (const [productId, delta] of stockDeltas) {
            await admin.from("invoice_items").insert({
                invoice_id: corrective.id,
                product_id: productId,
                name: "Correction",
                quantity: -delta,
                status: "validated",
            });
            const { data: current } = await admin
                .from("stock")
                .select("quantity")
                .eq("product_id", productId)
                .maybeSingle();
            const next = Math.max(0, (current?.quantity ?? 0) - delta);
            await admin.from("stock").update({ quantity: next }).eq("product_id", productId);
        }

        return NextResponse.json({ mode: "corrective", corrective_invoice_id: corrective.id });
    } catch (err) {
        captureError(err, { context: "invoice:cancel", invoiceId: id });
        return NextResponse.json({ error: "Failed to cancel invoice" }, { status: 500 });
    }
}

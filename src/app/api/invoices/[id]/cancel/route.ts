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

    // Fetch invoice items to know the stock delta to reverse.
    // Un blip DB ici ≠ « facture sans ligne » : laisser passer renverrait un faux « annulée »
    // SANS aucune réversion de stock (stock fantôme gonflé) → distinguer erreur de vide.
    const { data: items, error: itemsErr } = await admin
        .from("invoice_items")
        .select("id, product_id, quantity, received_qty, status")
        .eq("invoice_id", id);
    if (itemsErr) {
        captureError(itemsErr, { context: "invoice:cancel:items_read", invoiceId: id });
        return NextResponse.json({ error: "Failed to load invoice items" }, { status: 500 });
    }

    const activeItems = (items ?? []).filter((i) => i.status !== "rejected" && i.product_id);
    const stockDeltas = new Map<string, number>();
    for (const it of activeItems) {
        const qty = (it.received_qty ?? it.quantity) as number;
        if (!it.product_id || !qty) continue;
        stockDeltas.set(it.product_id as string, (stockDeltas.get(it.product_id as string) ?? 0) + qty);
    }

    const validatedAt = invoice.validated_at ? new Date(invoice.validated_at).getTime() : 0;
    const insideWindow = validatedAt > 0 && Date.now() - validatedAt < UNDO_WINDOW_MS;

    // Décrémente le stock d'un produit (réversion d'une réception facture).
    // Renvoie false si la réversion N'A PAS pu être appliquée — SANS jamais forcer le
    // stock à 0 : une lecture en échec ≠ « stock nul » → on préserve l'existant + on signale.
    // (NB : ce read-modify-write n'est pas atomique vs un webhook concurrent ; l'annulation
    // est une action marchand manuelle rare → exposition faible. Cf. worklog : router via
    // `update_stock_atomic` en mode delta = piste de durcissement [Rang 2].)
    async function reverseStock(productId: string, delta: number): Promise<boolean> {
        const { data: current, error: readErr } = await admin
            .from("stock")
            .select("quantity")
            .eq("product_id", productId)
            .maybeSingle();
        if (readErr) {
            captureError(readErr, { context: "invoice:cancel:reverse_read", invoiceId: id, productId });
            return false;
        }
        const next = Math.max(0, (current?.quantity ?? 0) - delta);
        const { error: updErr } = await admin.from("stock").update({ quantity: next }).eq("product_id", productId);
        if (updErr) {
            captureError(updErr, { context: "invoice:cancel:reverse_update", invoiceId: id, productId });
            return false;
        }
        return true;
    }

    try {
        if (insideWindow) {
            // Hard cancel: decrement stock, reset invoice to pending, clear validated_at
            let failed = 0;
            for (const [productId, delta] of stockDeltas) {
                if (!(await reverseStock(productId, delta))) failed++;
            }
            // Réversion partielle/échouée → ne PAS remettre la facture en `parsed` (elle reste
            // annulable) et signaler honnêtement, plutôt qu'un faux « annulée » sur stock fantôme.
            if (failed > 0) {
                return NextResponse.json(
                    { error: "Stock reversal failed", reversed: stockDeltas.size - failed, failed },
                    { status: 500 },
                );
            }
            const { error: invErr } = await admin
                .from("invoices")
                .update({ status: "parsed", validated_at: null, ux_status: "pending" })
                .eq("id", id);
            if (invErr) {
                captureError(invErr, { context: "invoice:cancel:reset_status", invoiceId: id });
                return NextResponse.json({ error: "Stock reversed but failed to reset invoice" }, { status: 500 });
            }
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

        let failed = 0;
        for (const [productId, delta] of stockDeltas) {
            const { error: itemErr } = await admin.from("invoice_items").insert({
                invoice_id: corrective.id,
                product_id: productId,
                name: "Correction",
                quantity: -delta,
                status: "validated",
            });
            if (itemErr) {
                // Ligne d'audit du correctif manquante : signalé, non bloquant (le stock prime).
                captureError(itemErr, { context: "invoice:cancel:corrective_item", invoiceId: id, productId });
            }
            if (!(await reverseStock(productId, delta))) failed++;
        }
        if (failed > 0) {
            return NextResponse.json(
                {
                    error: "Stock reversal failed",
                    corrective_invoice_id: corrective.id,
                    reversed: stockDeltas.size - failed,
                    failed,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({ mode: "corrective", corrective_invoice_id: corrective.id });
    } catch (err) {
        captureError(err, { context: "invoice:cancel", invoiceId: id });
        return NextResponse.json({ error: "Failed to cancel invoice" }, { status: 500 });
    }
}

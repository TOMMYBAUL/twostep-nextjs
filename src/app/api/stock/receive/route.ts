import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error";

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

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) captureError(authErr, { route: "stock/receive", phase: "auth" });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant, error: merchantErr } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    // Blip DB ≠ « pas de compte marchand » : ne pas masquer une panne en 404 (même classe
    // que la lecture incoming ci-dessous). PGRST116 (0 ligne) reste un 404 légitime.
    if (merchantErr && merchantErr.code !== "PGRST116") {
        captureError(merchantErr, { route: "stock/receive", phase: "merchant_lookup" });
        return NextResponse.json({ error: "Failed to resolve merchant" }, { status: 500 });
    }
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

    const { data: incomingItems, error: incomingErr } = await query;

    // Erreur DB ≠ « rien à recevoir » : un blip ne doit pas se faire passer pour une
    // absence de livraison (sinon le marchand croit avoir tout reçu). On distingue.
    if (incomingErr) {
        captureError(incomingErr, { route: "stock/receive", phase: "fetch_incoming" });
        return NextResponse.json({ error: "Failed to read incoming stock" }, { status: 500 });
    }

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
    let failed = 0;

    for (const item of incomingItems) {
        // Atomic: update stock + mark received + create feed event.
        // Ne compter `received` QUE si la RPC réussit : un échec avalé annoncerait une
        // livraison reçue alors que le stock n'a PAS bougé (perte silencieuse north-star).
        // La RPC est atomique par item → un échec ne demi-applique rien et laisse la ligne
        // en `incoming` = re-cliquable (idempotent), donc on continue les autres lignes.
        const { error: rpcErr } = await adminSupabase.rpc("receive_stock_incoming", {
            p_incoming_id: item.id,
            p_product_id: item.product_id,
            p_delta: item.quantity,
            p_merchant_id: merchant.id,
        });

        if (rpcErr) {
            captureError(rpcErr, {
                route: "stock/receive",
                phase: "receive_stock_incoming",
                incomingId: item.id,
                productId: item.product_id,
            });
            failed++;
            continue;
        }

        received++;
    }

    // Rien reçu alors que des lignes étaient à traiter = échec total → 500 (l'UI affiche
    // une erreur au lieu d'un faux « stock mis à jour »). Partiel → 200 avec un `received`
    // honnête (les lignes échouées restent `incoming`, re-cliquables).
    if (received === 0 && failed > 0) {
        return NextResponse.json({ error: "Failed to receive stock", failed }, { status: 500 });
    }

    return NextResponse.json({ received, failed });
    } catch (e) {
        captureError(e, { route: "stock/receive" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

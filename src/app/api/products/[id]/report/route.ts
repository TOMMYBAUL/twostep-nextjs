import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { captureError } from "@/lib/error";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = new Set(["not_in_store", "wrong_price", "other"]);

/**
 * Signalement consommateur sur un produit ("pas en stock sur place", "mauvais
 * prix"). Authentifié + rate-limité. Le merchant_id est dérivé du produit côté
 * serveur (jamais du client) pour empêcher la pollution de données.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
        }

        const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "stock:report", 20);
        if (limited) return limited;

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const reason = String(body.reason ?? "");
        if (!REASONS.has(reason)) {
            return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
        }

        // merchant_id dérivé du produit (jamais du client).
        const admin = createAdminClient();
        const { data: product } = await admin
            .from("products")
            .select("id, merchant_id")
            .eq("id", id)
            .maybeSingle();
        if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

        const { error } = await admin.from("stock_reports").insert({
            product_id: product.id,
            merchant_id: product.merchant_id,
            reporter_id: user.id,
            reason,
        });
        if (error) throw error;

        return NextResponse.json({ ok: true });
    } catch (e) {
        captureError(e, { route: "products/[id]/report" });
        return NextResponse.json({ error: "Report failed" }, { status: 500 });
    }
}

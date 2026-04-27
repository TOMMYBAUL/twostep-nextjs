/**
 * Admin endpoint pour trigger manuellement un embed CLIP sur un product (Cycle 8.5).
 *
 * Usage : POST /api/admin/clip/embed-product { productId: string }
 * Auth : Supabase `app_metadata.role === "admin"` via requireAdmin().
 *
 * Pour le bootstrap initial Kap pilote (200 produits), on appellera ce endpoint
 * en boucle séquentielle. À scaler via Inngest plus tard (V1.5).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { embedAndStoreProduct } from "@/lib/enrichment/clip-pipeline";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    let body: { productId?: string };
    try {
        body = (await req.json()) as { productId?: string };
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const productId = body.productId;
    if (typeof productId !== "string" || !UUID_REGEX.test(productId)) {
        return NextResponse.json({ error: "invalid_product_id" }, { status: 400 });
    }

    const outcome = await embedAndStoreProduct(productId);

    if (outcome.status === "failed") {
        return NextResponse.json(
            { status: outcome.status, error: outcome.error },
            { status: 500 },
        );
    }

    return NextResponse.json(outcome);
}

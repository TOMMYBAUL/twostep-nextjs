/**
 * POST /api/admin/onboarding/publish
 *
 * Phase 1 Task 1.5 — bascule tous les products du marchand de
 * (visible=false, review_status='pending_review') vers
 * (visible=true, review_status='validated'). À ce moment-là ils apparaissent
 * dans le feed LFP et l'app consumer.
 *
 * Body : { merchantId: string, dryRun?: boolean }
 *  - dryRun=true → renvoie count + sample (5 premiers) sans modifier
 *  - dryRun=false (défaut) → bulk update + renvoie count
 *
 * Auth : requireAdmin (Supabase metadata).
 *
 * NOTE V1 publication bulk : tous les products en pending_review du marchand
 * passent en validated, sans sélection fine. Si Thomas veut publication sélective
 * (par row), c'est V2 — actuel scope V2 plan = bulk publish suffit pour pilote Kap.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PublishBody {
    merchantId?: unknown;
    dryRun?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    let body: PublishBody;
    try {
        body = (await req.json()) as PublishBody;
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const merchantId = typeof body.merchantId === "string" ? body.merchantId : "";
    if (!UUID_REGEX.test(merchantId)) {
        return NextResponse.json({ error: "invalid_merchant_id" }, { status: 400 });
    }
    const dryRun = body.dryRun === true;

    const admin = createAdminClient();

    if (dryRun) {
        // Preview : count + sample 5 first
        const { data: sample, error: sampleErr, count } = await admin
            .from("products")
            .select("id, name, ean, brand, price_cents, channel", { count: "exact" })
            .eq("merchant_id", merchantId)
            .eq("review_status", "pending_review")
            .eq("visible", false)
            .limit(5);

        if (sampleErr) {
            return NextResponse.json({ error: sampleErr.message }, { status: 500 });
        }
        return NextResponse.json({
            dryRun: true,
            count: count ?? 0,
            sample: sample ?? [],
        });
    }

    // Real publish — atomic bulk update
    const { error: updateErr, count } = await admin
        .from("products")
        .update({ visible: true, review_status: "validated" })
        .eq("merchant_id", merchantId)
        .eq("review_status", "pending_review")
        .eq("visible", false);

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ published: count ?? 0 });
}

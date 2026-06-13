import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichOneProduct, type EnrichableProduct } from "@/lib/enrichment/enrich-product";
import { captureError } from "@/lib/error";

// Enrichissement lent (appels API externes en série, 10-30 s/produit) → on
// réserve le budget maximal Fluid et on traite un petit lot par invocation.
export const maxDuration = 300;

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;
const STUCK_MS = 10 * 60_000;

export async function GET(req: NextRequest) {
    return handle(req);
}
export async function POST(req: NextRequest) {
    return handle(req);
}

/**
 * Worker de la file enrichment_jobs (cron). Draine un lot de jobs, enrichit
 * chaque produit via enrichOneProduct (cascade + score + visibilité), marque
 * done/failed, et recatégorise les marchands touchés en fin de passage.
 * Mono-instance via claim_enrichment_jobs (FOR UPDATE SKIP LOCKED).
 */
async function handle(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Reset des jobs bloqués (worker crashé en plein traitement).
    await admin
        .from("enrichment_jobs")
        .update({ status: "pending" })
        .eq("status", "processing")
        .lt("updated_at", new Date(Date.now() - STUCK_MS).toISOString());

    const { data: jobs, error: claimErr } = await admin.rpc("claim_enrichment_jobs", { p_limit: BATCH_SIZE });
    if (claimErr) {
        captureError(claimErr, { route: "cron/enrich-products", phase: "claim" });
        return NextResponse.json({ error: "claim failed" }, { status: 500 });
    }
    if (!jobs || jobs.length === 0) {
        return NextResponse.json({ processed: 0 });
    }

    let done = 0;
    let failed = 0;
    const touchedMerchants = new Set<string>();

    for (const job of jobs as { id: string; product_id: string; merchant_id: string; attempts: number }[]) {
        try {
            const { data: product } = await admin
                .from("products")
                .select("id, merchant_id, ean, sku, name, brand, review_status")
                .eq("id", job.product_id)
                .single();

            // Produit supprimé entre-temps → job obsolète, on le clôt sans erreur.
            if (!product) {
                await admin.from("enrichment_jobs").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", job.id);
                continue;
            }

            await enrichOneProduct(product as EnrichableProduct, admin);

            await admin
                .from("enrichment_jobs")
                .update({ status: "done", error: null, processed_at: new Date().toISOString() })
                .eq("id", job.id);
            touchedMerchants.add(job.merchant_id);
            done++;
        } catch (err) {
            const giveUp = job.attempts >= MAX_ATTEMPTS;
            await admin
                .from("enrichment_jobs")
                .update({
                    status: giveUp ? "failed" : "pending",
                    error: err instanceof Error ? err.message.slice(0, 500) : "unknown",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", job.id);
            captureError(err, { route: "cron/enrich-products", productId: job.product_id, attempt: job.attempts });
            failed++;
        }
    }

    // Catégorisation IA par marchand touché (batch, hors du chemin par-produit).
    if (touchedMerchants.size > 0) {
        try {
            const { categorizeMerchantProducts } = await import("@/lib/ai/categorize");
            for (const merchantId of touchedMerchants) {
                await categorizeMerchantProducts(merchantId);
            }
        } catch (err) {
            captureError(err, { route: "cron/enrich-products", phase: "categorize" });
        }
    }

    return NextResponse.json({ processed: jobs.length, done, failed });
}

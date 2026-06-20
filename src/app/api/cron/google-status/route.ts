import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken } from "@/lib/google/merchant";
import { fetchProcessedProducts, summarizeProductStatuses, buildDisapprovalAlerts } from "@/lib/google/product-status";
import { chunk } from "@/lib/ingest/reconcile";
import { captureError } from "@/lib/error";

/**
 * Cron de RELECTURE du statut Google (read-back du canal LFP Voie A).
 *
 * `google-feed` pousse les produits mais ne sait PAS s'ils sont acceptés : un 200
 * sur `productInputs:insert` ne garantit pas l'acceptation (Google traite ensuite
 * de façon asynchrone et peut rejeter). Ce cron lit `accounts/{account}/products`
 * et rend VISIBLES les rejets (Sentry) au lieu de pousser en aveugle — c'est le
 * faux positif n°1 du north-star (« sur Google » alors que rejeté).
 *
 * Planifié après le feed (feed à 03:00, ce cron à 06:00) pour laisser à Google le
 * temps de traiter. Lecture seule : aucune écriture DB, aucune migration.
 */
export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: connections } = await supabase
        .from("google_merchant_connections")
        .select("merchant_id");

    if (!connections || connections.length === 0) {
        return NextResponse.json({ merchants: 0, message: "No Google-connected merchants" });
    }

    let disapprovedTotal = 0;
    let errors = 0;
    const perMerchant: Array<{
        merchant_id: string;
        total: number;
        served: number;
        pending: number;
        disapproved: number;
    }> = [];

    for (const conn of connections) {
        try {
            const auth = await getGoogleAccessToken(conn.merchant_id);
            if (!auth) {
                // Token mort = on ne peut pas lire le statut → rendre visible (Sentry),
                // ne pas confondre avec « 0 rejet ».
                errors++;
                captureError(new Error("Google token unavailable for status read-back"), {
                    cron: "google-status",
                    merchantId: conn.merchant_id,
                });
                continue;
            }

            const products = await fetchProcessedProducts(auth.accessToken, auth.connection.google_merchant_id);
            const summary = summarizeProductStatuses(products);
            disapprovedTotal += summary.disapproved;
            perMerchant.push({
                merchant_id: conn.merchant_id,
                total: summary.total,
                served: summary.served,
                pending: summary.pending,
                disapproved: summary.disapproved,
            });

            if (summary.disapproved > 0) {
                const topIssues = summary.issues
                    .filter((i) => i.severity === "DISAPPROVED")
                    .slice(0, 5)
                    .map((i) => `${i.code}×${i.count}`)
                    .join(", ");
                captureError(
                    new Error(
                        `Google a rejeté ${summary.disapproved}/${summary.total} produits — ${topIssues || "cf. itemLevelIssues"}`,
                    ),
                    {
                        cron: "google-status",
                        merchantId: conn.merchant_id,
                        disapproved: summary.disapproved,
                        served: summary.served,
                        pending: summary.pending,
                        issues: summary.issues.slice(0, 10),
                        disapprovedOfferIds: summary.disapprovedOfferIds.slice(0, 50),
                    },
                );

                // Persistance marchand (alerte qualité « rejeté par Google ») — GATED.
                // Inerte tant que la migration 106 (type google_disapproved au CHECK)
                // n'est pas appliquée ET GOOGLE_DISAPPROVAL_ALERTS=1. Sans la migration,
                // l'INSERT échouerait sur la contrainte (cf. LESSONS 081/089). Le chemin
                // Sentry ci-dessus reste, lui, toujours actif.
                if (process.env.GOOGLE_DISAPPROVAL_ALERTS === "1") {
                    const alerts = buildDisapprovalAlerts(products, conn.merchant_id);
                    const { data: open } = await supabase
                        .from("quality_alerts")
                        .select("product_id")
                        .eq("merchant_id", conn.merchant_id)
                        .eq("type", "google_disapproved")
                        .eq("status", "open");
                    const openSet = new Set((open ?? []).map((a: { product_id: string | null }) => a.product_id));
                    const fresh = alerts.filter((a) => !openSet.has(a.product_id));
                    // Batcher les INSERT (URL/payload bornés, cf. LESSONS chunk()).
                    for (const batch of chunk(fresh, 500)) {
                        if (batch.length > 0) await supabase.from("quality_alerts").insert(batch);
                    }
                }
            }
        } catch (err) {
            errors++;
            captureError(err, { cron: "google-status", merchantId: conn.merchant_id });
        }
    }

    return NextResponse.json({
        merchants: connections.length,
        disapproved_total: disapprovedTotal,
        errors,
        per_merchant: perMerchant,
    });
}

export { POST as GET };

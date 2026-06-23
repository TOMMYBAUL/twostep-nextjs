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

    const { data: connections, error: connectionsErr } = await supabase
        .from("google_merchant_connections")
        .select("merchant_id");

    // Échec de lecture DB ≠ « aucun marchand connecté » : sans cette garde, un blip
    // DB faisait no-op SILENCIEUX pour TOUS les marchands (HTTP 200, aucun Sentry,
    // aucun statut). Or ce cron EST le read-back qui rend visible le faux positif
    // n°1 du north-star (« sur Google » alors que rejeté) → un skip muet ré-aveugle
    // exactement ce contrôle. Parité avec le jumeau google-feed (fix maillon 7,
    // cf. LESSONS « le read qui décide rien-à-traiter doit distinguer erreur de vide »).
    if (connectionsErr) {
        captureError(connectionsErr, { cron: "google-status", step: "load-connections" });
        return NextResponse.json({ error: "db_error", message: connectionsErr.message }, { status: 500 });
    }

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
                    const { data: open, error: openErr } = await supabase
                        .from("quality_alerts")
                        .select("product_id")
                        .eq("merchant_id", conn.merchant_id)
                        .eq("type", "google_disapproved")
                        .eq("status", "open");
                    // Lecture de dédup en erreur ≠ « aucune alerte ouverte » : `open ?? []`
                    // sur un blip DB traiterait TOUT comme neuf → ré-insertion en double à
                    // chaque cron. On rend l'erreur visible et on SKIP la persistance ce
                    // cycle (le signal Sentry au-dessus reste émis ; la persistance retente
                    // au prochain cron sans polluer la table). (revue SF-hunter, finding A)
                    if (openErr) {
                        captureError(openErr, { cron: "google-status", merchantId: conn.merchant_id, step: "load-open-alerts" });
                    } else {
                        const openSet = new Set((open ?? []).map((a: { product_id: string | null }) => a.product_id));
                        const fresh = alerts.filter((a) => !openSet.has(a.product_id));
                        // Batcher les INSERT (URL/payload bornés, cf. LESSONS chunk()).
                        for (const batch of chunk(fresh, 500)) {
                            if (batch.length === 0) continue;
                            // INSERT best-effort APRÈS le signal Sentry critique : une écriture
                            // ratée (contrainte CHECK si 106 non appliquée, RLS, drop) ne doit
                            // pas être avalée → captureError, sans throw (ne pas faire échouer
                            // tout le marchand sur une persistance secondaire). (finding B)
                            const { error: insErr } = await supabase.from("quality_alerts").insert(batch);
                            if (insErr) captureError(insErr, { cron: "google-status", merchantId: conn.merchant_id, step: "insert-alerts" });
                        }
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

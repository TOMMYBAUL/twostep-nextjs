import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
    computeCategoryPriceBounds,
    isPriceAberrant,
    isStockStale,
    type PriceBounds,
} from "@/lib/monitoring/quality";
import { captureError } from "@/lib/error";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { chunk } from "@/lib/ingest/reconcile";

/**
 * Cron monitoring qualité : détecte stock figé + prix aberrant + flux d'ingestion
 * arrêté + caisse déconnectée, et crée des quality_alerts (dédupliquées par index
 * partiel `uq_quality_alerts_open`). Lu par le dashboard marchand.
 *
 * ⚠️ C'est l'ALARME de complétude (north-star : « ne rien perdre silencieusement »).
 * Une alarme qui échoue en silence = la garantie entière est nulle. Donc TOUTES ses
 * lectures sont fail-loud ou fail-visible, et sa lecture produit est PAGINÉE :
 *  - `.limit(50000)` était plafonné par `max-rows` PostgREST (1000 sur ce projet) →
 *    à l'échelle pilote (Deerskin = milliers de SKU) le watchdog ne contrôlait que
 *    les 1000 premiers produits par id → stock figé/prix aberrant AU-DELÀ jamais
 *    alerté = perte silencieuse de la garantie même (cf. thème SCALE).
 *  - la lecture de dédup (`alreadyOpen`) était plafonnée à 1000 : avec >1000 alertes
 *    ouvertes (catalogue périmé de milliers de lignes), le set était PARTIEL → un
 *    produit déjà alerté hors des 1000 premiers repassait dans `toInsert` → l'INSERT
 *    violait `uq_quality_alerts_open` → **tout le batch échouait** (erreur avalée) →
 *    ZÉRO alerte insérée ce run. On pagine donc la dédup ET on la rend fail-loud.
 *
 * Toutes les lectures traitent `data=null` sans erreur comme un ÉCHEC (jamais `?? []`
 * silencieux → alarme aveugle sous un faux ok:true). ⚠️ TRIP-WIRE D'ÉCHELLE : les 4
 * lectures MARCHAND-scoped (ingest_credentials silencieux, pos_connections mortes, +
 * leurs 2 dédups `merchant_id`) restent NON paginées — leur cardinalité est bornée par
 * le nombre de MARCHANDS (≪ 1000 aujourd'hui). Elles sont fail-VISIBLE sur `error` mais
 * PAS immunisées à la troncature silencieuse `max-rows` (sans erreur). **À PAGINER via
 * `fetchAllRows` si le nombre de marchands approche ~1000** (succès = ce cas arrivera).
 */
export const maxDuration = 300;

type ProductRow = {
    id: string;
    merchant_id: string;
    category: string | null;
    price: number | null;
    stock: { quantity: number; updated_at: string | null } | { quantity: number; updated_at: string | null }[] | null;
};

function stockOf(row: ProductRow): { quantity: number; updated_at: string | null } | null {
    if (!row.stock) return null;
    return Array.isArray(row.stock) ? (row.stock[0] ?? null) : row.stock;
}

export async function GET(request: Request) {
    const authHeader = request.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const admin = createAdminClient();
        const now = new Date();
        // Chaque watchdog est INDÉPENDANT : une lecture qui échoue dégrade SON bloc
        // (captureError + `degraded`), jamais tout le cron en silence — mais jamais
        // non plus d'insertion à l'aveugle (sans dédup fiable → doublons/unique-violation).
        const errors: string[] = [];

        // Lecture produit PAGINÉE (KEYSET, cf. fetchAllRows) : sinon troncature
        // silencieuse `max-rows` → le watchdog ignore les produits au-delà du cap.
        const { data: products, error: productsErr } = await fetchAllRows<ProductRow>(() =>
            admin
                .from("products")
                .select("id, merchant_id, category, price, stock(quantity, updated_at)")
                .is("archived_at", null)
                .order("id", { ascending: true }),
        );
        // Ne pas masquer un échec de requête en "0 produit, ok:true".
        if (productsErr) throw productsErr;
        // data null SANS error = anomalie SDK (un SELECT liste renvoie [] sur 0 ligne) :
        // lever plutôt qu'un scan all-empty trompeur (parité feed-preview/google-feed).
        if (!products) throw new Error("products null without error — unexpected SDK state");

        const rows = products as unknown as ProductRow[];

        // Bornes de prix robustes PAR catégorie.
        const pricesByCategory = new Map<string, number[]>();
        for (const r of rows) {
            if (r.category && typeof r.price === "number" && r.price > 0) {
                const arr = pricesByCategory.get(r.category) ?? [];
                arr.push(r.price);
                pricesByCategory.set(r.category, arr);
            }
        }
        const boundsByCategory = new Map<string, PriceBounds | null>();
        for (const [cat, prices] of pricesByCategory) {
            boundsByCategory.set(cat, computeCategoryPriceBounds(prices));
        }

        // Alertes déjà ouvertes → éviter les doublons. PAGINÉE (sinon set partiel à
        // 1000 → doublon dans l'INSERT → violation `uq_quality_alerts_open` → batch
        // entier rejeté). FAIL-LOUD : sans dédup fiable, on NE PEUT PAS insérer sans
        // risquer la violation → on dégrade le bloc stock/prix (jamais d'insert aveugle).
        const { data: openAlerts, error: openAlertsErr } = await fetchAllRows<{
            id: string;
            product_id: string | null;
            type: string;
        }>(() =>
            admin
                .from("quality_alerts")
                .select("id, product_id, type")
                .eq("status", "open")
                .order("id", { ascending: true }),
        );
        const dedupAvailable = !openAlertsErr && !!openAlerts;
        if (!dedupAvailable) {
            captureError(openAlertsErr ?? new Error("openAlerts null without error"), {
                route: "cron/quality-check",
                phase: "dedup-read",
            });
            errors.push("dedup-read-failed");
        }
        const alreadyOpen = new Set(
            (openAlerts ?? []).map((a: { product_id: string | null; type: string }) => `${a.product_id}:${a.type}`),
        );

        const toInsert: {
            merchant_id: string;
            product_id: string;
            type: string;
            detail: Record<string, unknown>;
        }[] = [];
        let staleCount = 0;
        let aberrantCount = 0;

        for (const r of rows) {
            const st = stockOf(r);

            if (st && isStockStale(st.updated_at, st.quantity, now)) {
                staleCount++;
                if (!alreadyOpen.has(`${r.id}:stock_stale`)) {
                    toInsert.push({
                        merchant_id: r.merchant_id,
                        product_id: r.id,
                        type: "stock_stale",
                        detail: { quantity: st.quantity, last_updated: st.updated_at },
                    });
                }
            }

            const bounds = r.category ? (boundsByCategory.get(r.category) ?? null) : null;
            if (isPriceAberrant(r.price, bounds)) {
                aberrantCount++;
                if (!alreadyOpen.has(`${r.id}:price_aberrant`)) {
                    toInsert.push({
                        merchant_id: r.merchant_id,
                        product_id: r.id,
                        type: "price_aberrant",
                        detail: { price: r.price, category: r.category, bounds },
                    });
                }
            }
        }

        // Insert par LOTS de 500 (proven pattern), erreur vérifiée par lot → jamais un
        // "success" quand une alerte n'a pas été écrite. N'insère QUE si la dédup est
        // fiable (sinon set partiel → violation unique → perte de tout le lot).
        let productAlertsNew = 0;
        if (dedupAvailable && toInsert.length > 0) {
            for (const batch of chunk(toInsert, 500)) {
                const { error: insErr } = await admin.from("quality_alerts").insert(batch);
                if (insErr) {
                    captureError(insErr, { route: "cron/quality-check", phase: "insert-product-alerts" });
                    errors.push("insert-product-alerts-failed");
                } else {
                    productAlertsNew += batch.length;
                }
            }
        }

        // ── Watchdog ingestion : flux de push arrêté (last_used_at > 48 h) ──────
        // Un marchand dont la caisse poussait puis a cessé → stock figé/mort
        // affiché sans que personne ne le sache. On alerte (dashboard + Sentry).
        const SILENCE_H = 48;
        const silentBefore = new Date(now.getTime() - SILENCE_H * 3_600_000).toISOString();
        const { data: silentCreds, error: silentCredsErr } = await admin
            .from("ingest_credentials")
            .select("merchant_id, last_used_at")
            .not("last_used_at", "is", null)
            .lt("last_used_at", silentBefore);

        let ingestSilentNew = 0;
        // `data=null` SANS error = anomalie SDK (un SELECT liste renvoie [] sur 0 ligne) : la
        // traiter comme un ÉCHEC, sinon `?? []` la muerait en « aucun marchand silencieux » →
        // alarme AVEUGLE sous un faux ok:true (même garde que la lecture produit + dédup).
        if (silentCredsErr || !silentCreds) {
            captureError(silentCredsErr ?? new Error("silentCreds null without error — unexpected SDK state"), {
                route: "cron/quality-check",
                phase: "ingest-watchdog-read",
            });
            errors.push("ingest-watchdog-read-failed");
        } else if (silentCreds.length > 0) {
            const { data: openIngest, error: openIngestErr } = await admin
                .from("quality_alerts")
                .select("merchant_id")
                .eq("type", "ingest_silent")
                .eq("status", "open");
            // Dédup indisponible (erreur OU null sans erreur) → ne PAS insérer à l'aveugle : un set
            // de dédup vide ré-insérerait un marchand déjà alerté → violation `uq_quality_alerts_merchant_open`
            // → tout l'insert rejeté (même piège que la dédup produit, cf. finding revue SF-hunter).
            if (openIngestErr || !openIngest) {
                captureError(openIngestErr ?? new Error("openIngest null without error — unexpected SDK state"), {
                    route: "cron/quality-check",
                    phase: "ingest-watchdog-dedup",
                });
                errors.push("ingest-watchdog-dedup-failed");
            } else {
                const alreadyAlerted = new Set(
                    openIngest.map((a: { merchant_id: string }) => a.merchant_id),
                );

                const ingestAlerts = silentCreds
                    .filter((c: { merchant_id: string }) => !alreadyAlerted.has(c.merchant_id))
                    .map((c: { merchant_id: string; last_used_at: string }) => ({
                        merchant_id: c.merchant_id,
                        product_id: null,
                        type: "ingest_silent",
                        detail: { last_used_at: c.last_used_at, silence_hours: SILENCE_H },
                    }));
                if (ingestAlerts.length > 0) {
                    const { error: insErr } = await admin.from("quality_alerts").insert(ingestAlerts);
                    if (insErr) {
                        captureError(insErr, { route: "cron/quality-check", phase: "ingest-watchdog-insert" });
                        errors.push("ingest-watchdog-insert-failed");
                    } else {
                        ingestSilentNew = ingestAlerts.length;
                        captureError(
                            new Error(`Ingestion silencieuse : ${ingestAlerts.length} marchand(s) sans push depuis ${SILENCE_H} h`),
                            { route: "cron/quality-check", phase: "ingest-watchdog" },
                        );
                    }
                }
            }
        }

        // ── Watchdog OAuth : connexion POS dont le token est mort ──────────────
        // last_sync_status='error' = refresh échoué (token révoqué/expiré). Le
        // marchand doit reconnecter sa caisse, sinon son stock ne se sync plus.
        const { data: deadConns, error: deadConnsErr } = await admin
            .from("pos_connections")
            .select("merchant_id, provider, last_sync_error")
            .eq("last_sync_status", "error");

        let posDisconnectedNew = 0;
        // Même garde null-sans-erreur que le watchdog ingestion : jamais un skip muet sous ok:true.
        if (deadConnsErr || !deadConns) {
            captureError(deadConnsErr ?? new Error("deadConns null without error — unexpected SDK state"), {
                route: "cron/quality-check",
                phase: "pos-watchdog-read",
            });
            errors.push("pos-watchdog-read-failed");
        } else if (deadConns.length > 0) {
            const { data: openPos, error: openPosErr } = await admin
                .from("quality_alerts")
                .select("merchant_id")
                .eq("type", "pos_disconnected")
                .eq("status", "open");
            if (openPosErr || !openPos) {
                captureError(openPosErr ?? new Error("openPos null without error — unexpected SDK state"), {
                    route: "cron/quality-check",
                    phase: "pos-watchdog-dedup",
                });
                errors.push("pos-watchdog-dedup-failed");
            } else {
                const alreadyAlerted = new Set(
                    openPos.map((a: { merchant_id: string }) => a.merchant_id),
                );

                const posAlerts = deadConns
                    .filter((c: { merchant_id: string }) => !alreadyAlerted.has(c.merchant_id))
                    .map((c: { merchant_id: string; provider: string; last_sync_error: string | null }) => ({
                        merchant_id: c.merchant_id,
                        product_id: null,
                        type: "pos_disconnected",
                        detail: { provider: c.provider, error: c.last_sync_error },
                    }));
                if (posAlerts.length > 0) {
                    const { error: insErr } = await admin.from("quality_alerts").insert(posAlerts);
                    if (insErr) {
                        captureError(insErr, { route: "cron/quality-check", phase: "pos-watchdog-insert" });
                        errors.push("pos-watchdog-insert-failed");
                    } else {
                        posDisconnectedNew = posAlerts.length;
                        captureError(
                            new Error(`Caisse déconnectée : ${posAlerts.length} marchand(s) à reconnecter`),
                            { route: "cron/quality-check", phase: "pos-watchdog" },
                        );
                    }
                }
            }
        }

        // Statut HONNÊTE : `ok:false`/`degraded` si un watchdog a échoué (surfacé Sentry),
        // jamais un faux "tout va bien". La lecture produit (cœur) a réussi ici (sinon throw).
        return NextResponse.json({
            ok: errors.length === 0,
            degraded: errors.length > 0,
            products_checked: rows.length,
            stock_stale: staleCount,
            price_aberrant: aberrantCount,
            new_alerts: productAlertsNew,
            ingest_silent_new: ingestSilentNew,
            pos_disconnected_new: posDisconnectedNew,
            ...(errors.length > 0 ? { errors } : {}),
        });
    } catch (e) {
        captureError(e, { route: "cron/quality-check" });
        return NextResponse.json(
            { error: `Quality check failed: ${e instanceof Error ? e.message : "unknown"}` },
            { status: 500 },
        );
    }
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
    computeCategoryPriceBounds,
    isPriceAberrant,
    isStockStale,
    type PriceBounds,
} from "@/lib/monitoring/quality";
import { captureError } from "@/lib/error";

/**
 * Cron monitoring qualité : détecte stock figé + prix aberrant et crée des
 * quality_alerts (dédupliquées par index partiel). Lu par le dashboard marchand.
 */
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

        const { data: products, error: productsErr } = await admin
            .from("products")
            .select("id, merchant_id, category, price, stock(quantity, updated_at)")
            .is("archived_at", null)
            .limit(50000);
        // Ne pas masquer un échec de requête en "0 produit, ok:true".
        if (productsErr) throw productsErr;

        const rows = (products ?? []) as unknown as ProductRow[];

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

        // Alertes déjà ouvertes → éviter les doublons.
        const { data: openAlerts } = await admin
            .from("quality_alerts")
            .select("product_id, type")
            .eq("status", "open");
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

        if (toInsert.length > 0) {
            await admin.from("quality_alerts").insert(toInsert);
        }

        // ── Watchdog ingestion : flux de push arrêté (last_used_at > 48 h) ──────
        // Un marchand dont la caisse poussait puis a cessé → stock figé/mort
        // affiché sans que personne ne le sache. On alerte (dashboard + Sentry).
        const SILENCE_H = 48;
        const silentBefore = new Date(now.getTime() - SILENCE_H * 3_600_000).toISOString();
        const { data: silentCreds } = await admin
            .from("ingest_credentials")
            .select("merchant_id, last_used_at")
            .not("last_used_at", "is", null)
            .lt("last_used_at", silentBefore);

        let ingestSilentNew = 0;
        if (silentCreds && silentCreds.length > 0) {
            const { data: openIngest } = await admin
                .from("quality_alerts")
                .select("merchant_id")
                .eq("type", "ingest_silent")
                .eq("status", "open");
            const alreadyAlerted = new Set((openIngest ?? []).map((a: { merchant_id: string }) => a.merchant_id));

            const ingestAlerts = silentCreds
                .filter((c: { merchant_id: string }) => !alreadyAlerted.has(c.merchant_id))
                .map((c: { merchant_id: string; last_used_at: string }) => ({
                    merchant_id: c.merchant_id,
                    product_id: null,
                    type: "ingest_silent",
                    detail: { last_used_at: c.last_used_at, silence_hours: SILENCE_H },
                }));
            if (ingestAlerts.length > 0) {
                await admin.from("quality_alerts").insert(ingestAlerts);
                ingestSilentNew = ingestAlerts.length;
                captureError(new Error(`Ingestion silencieuse : ${ingestAlerts.length} marchand(s) sans push depuis ${SILENCE_H} h`), { route: "cron/quality-check", phase: "ingest-watchdog" });
            }
        }

        // ── Watchdog OAuth : connexion POS dont le token est mort ──────────────
        // last_sync_status='error' = refresh échoué (token révoqué/expiré). Le
        // marchand doit reconnecter sa caisse, sinon son stock ne se sync plus.
        const { data: deadConns } = await admin
            .from("pos_connections")
            .select("merchant_id, provider, last_sync_error")
            .eq("last_sync_status", "error");

        let posDisconnectedNew = 0;
        if (deadConns && deadConns.length > 0) {
            const { data: openPos } = await admin
                .from("quality_alerts")
                .select("merchant_id")
                .eq("type", "pos_disconnected")
                .eq("status", "open");
            const alreadyAlerted = new Set((openPos ?? []).map((a: { merchant_id: string }) => a.merchant_id));

            const posAlerts = deadConns
                .filter((c: { merchant_id: string }) => !alreadyAlerted.has(c.merchant_id))
                .map((c: { merchant_id: string; provider: string; last_sync_error: string | null }) => ({
                    merchant_id: c.merchant_id,
                    product_id: null,
                    type: "pos_disconnected",
                    detail: { provider: c.provider, error: c.last_sync_error },
                }));
            if (posAlerts.length > 0) {
                await admin.from("quality_alerts").insert(posAlerts);
                posDisconnectedNew = posAlerts.length;
                captureError(new Error(`Caisse déconnectée : ${posAlerts.length} marchand(s) à reconnecter`), { route: "cron/quality-check", phase: "pos-watchdog" });
            }
        }

        return NextResponse.json({
            ok: true,
            products_checked: rows.length,
            stock_stale: staleCount,
            price_aberrant: aberrantCount,
            new_alerts: toInsert.length,
            ingest_silent_new: ingestSilentNew,
            pos_disconnected_new: posDisconnectedNew,
        });
    } catch (e) {
        captureError(e, { route: "cron/quality-check" });
        return NextResponse.json(
            { error: `Quality check failed: ${e instanceof Error ? e.message : "unknown"}` },
            { status: 500 },
        );
    }
}

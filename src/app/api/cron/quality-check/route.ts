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

        const { data: products } = await admin
            .from("products")
            .select("id, merchant_id, category, price, stock(quantity, updated_at)")
            .is("archived_at", null)
            .limit(50000);

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

        return NextResponse.json({
            ok: true,
            products_checked: rows.length,
            stock_stale: staleCount,
            price_aberrant: aberrantCount,
            new_alerts: toInsert.length,
        });
    } catch (e) {
        captureError(e, { route: "cron/quality-check" });
        return NextResponse.json(
            { error: `Quality check failed: ${e instanceof Error ? e.message : "unknown"}` },
            { status: 500 },
        );
    }
}

/**
 * DEV-ONLY endpoint — test enrichment pipeline (Task 14 of plan 2026-04-21).
 * Replays resolveAndEnrich on every POS-sourced product of a merchant
 * regardless of current state, backing up original name/image first.
 *
 * Body params:
 *   - dry_run: boolean (default false) — simulates without DB writes
 *   - limit: number (optional) — cap N products processed
 *   - product_id: string (optional) — process only this one
 *
 * To remove after Task 14 validation.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAndEnrich, type ResolveAndEnrichResult } from "@/lib/enrichment/resolve-ean";
import { categorizeMerchantProducts } from "@/lib/ai/categorize";
import { groupVariantsByEAN } from "@/lib/pos/sync-engine";

type ProductRow = {
    id: string;
    name: string | null;
    brand: string | null;
    ean: string | null;
    sku: string | null;
    pos_item_id: string | null;
    photo_url: string | null;
    original_name: string | null;
    original_image_url: string | null;
};

type PerProduct = {
    id: string;
    name_before: string | null;
    ean_before: string | null;
    result: ResolveAndEnrichResult;
    duration_ms: number;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id: merchantId } = await params;
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run === true;
    const limit: number | null = typeof body.limit === "number" ? body.limit : null;
    const onlyProductId: string | null = typeof body.product_id === "string" ? body.product_id : null;

    const admin = createAdminClient();

    let query = admin
        .from("products")
        .select("id, name, brand, ean, sku, pos_item_id, photo_url, original_name, original_image_url")
        .eq("merchant_id", merchantId)
        .is("archived_at", null)
        .not("pos_item_id", "is", null);

    if (onlyProductId) query = query.eq("id", onlyProductId);
    if (limit) query = query.limit(limit);

    const { data: products, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!products || products.length === 0) {
        return NextResponse.json({ error: "No POS products found for merchant" }, { status: 404 });
    }

    const t0 = Date.now();
    const perProduct: PerProduct[] = [];
    const bySource: Record<string, number> = {
        direct_ean: 0,
        sku_match: 0,
        reverse_search: 0,
        serper_photo_only: 0,
        none: 0,
    };

    for (const p of products as ProductRow[]) {
        const t = Date.now();

        if (dryRun) {
            perProduct.push({
                id: p.id,
                name_before: p.name,
                ean_before: p.ean,
                result: { productId: p.id, ean: p.ean, source: "none" },
                duration_ms: 0,
            });
            continue;
        }

        // 1. Backup original name + image (only if not already backed up)
        const backup: Record<string, string | null> = {};
        if (!p.original_name && p.name) backup.original_name = p.name;
        if (!p.original_image_url && p.photo_url) backup.original_image_url = p.photo_url;
        if (Object.keys(backup).length > 0) {
            await admin.from("products").update(backup).eq("id", p.id);
        }

        // 2. Run enrichment
        let result: ResolveAndEnrichResult;
        try {
            result = await resolveAndEnrich({
                productId: p.id,
                ean: p.ean,
                sku: p.sku,
                name: p.name,
                brand: p.brand,
                merchantId,
            });
        } catch (err) {
            result = { productId: p.id, ean: p.ean, source: "none" };
            console.error("[test-enrich] failed", p.id, err);
        }

        bySource[result.source] = (bySource[result.source] ?? 0) + 1;

        // 3. Mark for review queue if anything was applied
        if (result.source !== "none") {
            await admin
                .from("products")
                .update({
                    enrichment_source: result.source,
                    review_status: "pending_review",
                    visible: false,
                })
                .eq("id", p.id);
        }

        perProduct.push({
            id: p.id,
            name_before: p.name,
            ean_before: p.ean,
            result,
            duration_ms: Date.now() - t,
        });
    }

    // After per-product enrichment, run the same post-pass as sync-engine + validate facture:
    //   1. AI categorization (Two-Step taxonomy)
    //   2. Group variants by EAN
    let categorized = 0;
    let groupedVisibleCount = 0;
    let postPassError: string | null = null;

    if (!dryRun) {
        try {
            const catRes = await categorizeMerchantProducts(merchantId);
            categorized = catRes?.categorized ?? 0;
        } catch (err) {
            postPassError = `categorize: ${err instanceof Error ? err.message : String(err)}`;
            console.error("[test-enrich] categorize failed:", err);
        }

        try {
            groupedVisibleCount = await groupVariantsByEAN(admin, merchantId);
        } catch (err) {
            const msg = `groupVariants: ${err instanceof Error ? err.message : String(err)}`;
            postPassError = postPassError ? `${postPassError}; ${msg}` : msg;
            console.error("[test-enrich] groupVariantsByEAN failed:", err);
        }
    }

    return NextResponse.json({
        merchant_id: merchantId,
        dry_run: dryRun,
        processed: products.length,
        by_source: bySource,
        total_duration_ms: Date.now() - t0,
        avg_duration_ms: Math.round((Date.now() - t0) / products.length),
        per_product: perProduct,
        post_pass: {
            categorized,
            grouped_visible_count: groupedVisibleCount,
            error: postPassError,
        },
    });
}

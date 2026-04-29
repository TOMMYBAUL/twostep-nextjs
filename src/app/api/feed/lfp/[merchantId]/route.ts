/**
 * GET /api/feed/lfp/[merchantId] — Voie B XML feed Google LFP (Phase 3 plan).
 *
 * Promesse Aftab Google 2026-04-24 : feed XML live Merchant Center mi-mai.
 *
 * Public route — Google crawler doit pouvoir l'atteindre sans auth.
 * Pas de RLS leak car on filtre uniquement visible=true + review_status=validated
 * (= produits que le marchand a explicitement publiés en feed consumer).
 *
 * ISR 15 min : Google ne re-crawl pas plus souvent en pratique. Limite la
 * charge DB. stale-while-revalidate 24h en cas de pic.
 */

import type { NextRequest } from "next/server";

import { buildLfpXml, type LfpProductRow } from "@/lib/google/lfp-xml";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const revalidate = 900; // 15 min ISR

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ merchantId: string }> },
): Promise<Response> {
    const { merchantId } = await params;

    if (!UUID_REGEX.test(merchantId)) {
        return new Response("invalid_merchant_id", { status: 400 });
    }

    const admin = createAdminClient();

    // ─── Récup merchant (slug = store_code Google) ───
    const { data: merchant, error: merchantErr } = await admin
        .from("merchants")
        .select("id, name, slug, status")
        .eq("id", merchantId)
        .maybeSingle();

    if (merchantErr) {
        return new Response(`db_error: ${merchantErr.message}`, { status: 500 });
    }
    if (!merchant) {
        return new Response("merchant_not_found", { status: 404 });
    }
    if (merchant.status && merchant.status !== "active") {
        return new Response("merchant_not_active", { status: 410 });
    }
    if (!merchant.slug) {
        return new Response("merchant_missing_slug", { status: 422 });
    }

    // ─── Récup products visibles + validés ───
    const { data: products, error: productsErr } = await admin
        .from("products")
        .select(
            "id, name, canonical_name, description, brand, ean, price, photo_url, photo_processed_url, stock(quantity)",
        )
        .eq("merchant_id", merchantId)
        .eq("visible", true)
        .eq("review_status", "validated");

    if (productsErr) {
        return new Response(`db_error: ${productsErr.message}`, { status: 500 });
    }

    const xml = buildLfpXml(
        { id: merchant.id, name: merchant.name, slug: merchant.slug },
        (products ?? []) as LfpProductRow[],
    );

    return new Response(xml, {
        status: 200,
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            // 15 min cache, stale-while-revalidate 24h en cas de pic
            "Cache-Control":
                "public, max-age=900, s-maxage=900, stale-while-revalidate=86400",
        },
    });
}

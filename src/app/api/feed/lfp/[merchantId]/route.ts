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

import { captureError } from "@/lib/error";
import { buildLfpXml, type LfpProductRow } from "@/lib/google/lfp-xml";
import { resolveStoreCode } from "@/lib/google/store-code";
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

    // ─── Récup merchant ───
    const { data: merchant, error: merchantErr } = await admin
        .from("merchants")
        .select("id, name, status")
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

    // ─── store_code canonique : valeur persistée à la connexion Content API si
    //     elle existe, sinon défaut déterministe `twostep-{id8}` — JAMAIS le slug.
    //     (Voie A et Voie B émettent désormais le MÊME store_code → un seul
    //     magasin côté Google, fin du faux positif "deux magasins fantômes".) ───
    const { data: connection, error: connectionErr } = await admin
        .from("google_merchant_connections")
        .select("store_code")
        .eq("merchant_id", merchantId)
        .maybeSingle();

    // Échec DB ici ≠ « pas de store_code persisté » : on garde le feed disponible
    // (endpoint public crawlé) via le fallback déterministe, mais on TRACE l'anomalie
    // — sinon un store_code divergent côté Google passerait pour une erreur de config.
    if (connectionErr) {
        captureError(connectionErr, { route: "lfp-feed", merchantId, step: "load-store-code" });
    }

    const storeCode = resolveStoreCode(merchantId, connection?.store_code);

    // ─── Récup products visibles + validés ───
    // GATE identique à la Voie A (cron `google-feed`) : un feed Google ne doit
    // JAMAIS annoncer un produit archivé (`archive_product` 068 met archived_at
    // SANS toucher visible → un archivé reste visible=true) ni une variante
    // (poussée individuellement = produit non identifié sur Google Shopping).
    // Les deux canaux de sortie Google émettent ainsi le MÊME ensemble de
    // produits — fin de la divergence (cf. store_code Voie A/B, maillon 7).
    const { data: products, error: productsErr } = await admin
        .from("products")
        .select(
            "id, name, canonical_name, description, brand, ean, price, photo_url, photo_processed_url, stock(quantity), promotions(sale_price, starts_at, ends_at)",
        )
        .eq("merchant_id", merchantId)
        .eq("visible", true)
        .eq("review_status", "validated")
        .is("archived_at", null)
        .is("variant_of", null);

    if (productsErr) {
        return new Response(`db_error: ${productsErr.message}`, { status: 500 });
    }

    const xml = buildLfpXml(
        { id: merchant.id, name: merchant.name },
        (products ?? []) as LfpProductRow[],
        storeCode,
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

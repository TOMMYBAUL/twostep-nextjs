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
import {
    lfpXmlHead,
    lfpXmlItem,
    lfpXmlTail,
    type LfpProductRow,
} from "@/lib/google/lfp-xml";
import { resolveStoreCode } from "@/lib/google/store-code";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamRows } from "@/lib/supabase/paginate";

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
    //
    // STREAMING + PAGINÉ : un SELECT non borné est tronqué à 1000 lignes par PostgREST
    // (sans erreur) → un catalogue >1000 produirait un XML PARTIEL crawlé par Google.
    // `streamRows` lit page par page (`.order("id")` = ordre déterministe entre pages)
    // et le feed est ÉMIS en flux (head → items page par page → tail) : la mémoire est
    // bornée à UNE page, jamais tout le XML 50k en RAM. Parité de gate avec les 3 autres
    // sorties Google (Voie A cron, feed-preview, inventory) via `lfpXmlItem`/`isFeedEligible`.
    const makeProductsQuery = () =>
        admin
            .from("products")
            .select(
                "id, name, canonical_name, description, brand, ean, price, photo_url, photo_processed_url, stock(quantity), promotions(sale_price, starts_at, ends_at)",
            )
            .eq("merchant_id", merchantId)
            .eq("visible", true)
            .eq("review_status", "validated")
            .is("archived_at", null)
            .is("variant_of", null)
            .order("id", { ascending: true });

    const pages = streamRows<LfpProductRow>(makeProductsQuery);

    // On consomme la PREMIÈRE page AVANT de construire la Response : une erreur de lecture
    // ici (ou `data=null` masqué) peut encore se traduire par un vrai 500 (rien n'a été
    // émis). Une fois le flux démarré, un échec sur une page ULTÉRIEURE ne peut plus changer
    // le statut → on AVORTE le flux (`controller.error`) plutôt que de servir un feed tronqué
    // passé pour complet (north-star : « jamais tronqué en silence »).
    let firstPage: Awaited<ReturnType<typeof pages.next>>;
    try {
        firstPage = await pages.next();
    } catch (err) {
        captureError(err, { route: "lfp-feed", merchantId, step: "load-products" });
        return new Response("db_error", { status: 500 });
    }

    const nowMs = Date.now();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                controller.enqueue(encoder.encode(lfpXmlHead({ id: merchant.id, name: merchant.name })));

                const emitPage = (rows: LfpProductRow[]) => {
                    for (const p of rows) {
                        const item = lfpXmlItem(p, storeCode, nowMs);
                        if (item) controller.enqueue(encoder.encode(item));
                    }
                };

                // `firstPage.done` est false : streamRows yield ≥ 1 page ([] si 0 ligne).
                if (firstPage.value) emitPage(firstPage.value);
                for await (const rows of pages) emitPage(rows);

                controller.enqueue(encoder.encode(lfpXmlTail()));
                controller.close();
            } catch (err) {
                // Lecture incomplète après le 1er chunk : on TRACE et on avorte le transfert.
                // Google verra une réponse HTTP interrompue (≠ feed complet) et re-crawlera —
                // jamais un 200 « complet » silencieusement tronqué.
                // `finally` : si `captureError` lève (service de report HS), `controller.error`
                // DOIT quand même s'exécuter — sinon le flux reste ouvert et la connexion pend
                // au lieu d'avorter immédiatement (Finding SF-hunter).
                try {
                    captureError(err, { route: "lfp-feed", merchantId, step: "stream-products" });
                } finally {
                    controller.error(err);
                }
            }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            // 15 min cache, stale-while-revalidate 24h en cas de pic
            "Cache-Control":
                "public, max-age=900, s-maxage=900, stale-while-revalidate=86400",
        },
    });
}

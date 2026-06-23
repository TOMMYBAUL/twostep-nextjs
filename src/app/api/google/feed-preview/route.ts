/**
 * GET /api/google/feed-preview — mode SHADOW/PREVIEW du feed Google LFP (item onboarding pilote).
 *
 * « Montrer au marchand EXACTEMENT ce qu'on publierait sur Google AVANT de publier, en lecture
 * seule. » C'est ce qui rend un pilote (Deerskin…) onboardable en confiance : il inspecte le feed
 * réel — produit par produit — au lieu de découvrir après coup un catalogue fantôme (ce qui a tué
 * MVMS/Milo). Le rendu VISUEL est à Thomas ; cette route est le backing data.
 *
 * HONNÊTETÉ / PARITÉ (le point crucial) : le preview réutilise la MÊME population (visible +
 * validated + non archivé + non variante), le MÊME gate (`classifyFeedRow`/`isFeedEligible`), le
 * MÊME transform (`transformProductToGoogle`) et le MÊME `store_code` que les DEUX canaux de sortie
 * live (Voie A `cron/google-feed`, Voie B `feed/lfp/[merchantId]`). Il ne PEUT donc pas diverger de
 * ce qui serait réellement poussé — un preview qui ment serait pire que pas de preview (même classe
 * « source unique » que store_code / honestSalePrice / D3).
 *
 * LECTURE SEULE : aucun appel à Google, aucune écriture. Pur calcul + lecture DB.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transformProductToGoogle } from "@/lib/google/feed";
import {
    classifyFeedRow,
    summarizePublishability,
    gtinOnlyTierEnabled,
    type FeedBlockReason,
} from "@/lib/google/feed-eligibility";
import { resolveStoreCode } from "@/lib/google/store-code";
import { captureError } from "@/lib/error";

/** Un produit qui NE serait PAS publié, avec ses causes (mode preview, par produit). */
interface BlockedProduct {
    id: string;
    name: string;
    ean: string | null;
    price: number | null;
    reasons: FeedBlockReason[];
}

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: merchant, error: merchantErr } = await supabase
            .from("merchants")
            .select("id, name")
            .eq("user_id", user.id)
            .single();

        // PGRST116 = aucune ligne (pas un profil marchand) → 403. Toute autre erreur DB
        // ≠ « pas de marchand » : la remonter (sinon un blip donnait un 403 trompeur).
        // Même garde que google/stats (parité du raisonnement anti-silence).
        if (merchantErr && merchantErr.code !== "PGRST116") {
            captureError(merchantErr, { route: "google/feed-preview", step: "load-merchant" });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
        }

        // Population EXACTEMENT celle des 2 feeds live (cron/google-feed + feed/lfp) : sinon le
        // preview montrerait un ensemble différent de ce qui publie = mensonge. Le SELECT reprend
        // les colonnes du transform (stock + promotions incluses) pour produire la ligne Google réelle.
        const { data: products, error: productsErr } = await supabase
            .from("products")
            .select(
                "id, name, canonical_name, description, brand, ean, price, photo_url, photo_processed_url, visible, stock(quantity), promotions(sale_price, starts_at, ends_at)",
            )
            .eq("merchant_id", merchant.id)
            .eq("visible", true)
            .eq("review_status", "validated")
            .is("archived_at", null)
            .is("variant_of", null);

        // Échec de lecture ≠ « 0 produit » : sans cette garde, un blip DB renvoyait un preview VIDE
        // (faux « rien à publier ») en silence — le marchand croirait son catalogue non publiable.
        if (productsErr) {
            captureError(productsErr, { route: "google/feed-preview", merchantId: merchant.id, step: "load-products" });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
        // data null SANS error = état SDK inattendu (un SELECT liste renvoie [] sur 0 ligne) : lever
        // plutôt qu'un preview all-empty trompeur (même garde défensive que google/stats + cron).
        if (!products) {
            captureError(new Error("products null without error — unexpected SDK state"), {
                route: "google/feed-preview",
                merchantId: merchant.id,
                step: "load-products",
            });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }

        // store_code canonique : valeur persistée (Content API) prime, sinon défaut déterministe
        // `twostep-{id8}` — JAMAIS le slug (parité Voie A/B, maillon store_code). Un blip de lecture
        // ≠ « pas de store_code » → on TRACE et on retombe sur le défaut déterministe (le même que le
        // feed utiliserait sur ce blip) ; le preview reste disponible (lecture-seule, pas critique).
        const { data: connection, error: connectionErr } = await supabase
            .from("google_merchant_connections")
            .select("store_code")
            .eq("merchant_id", merchant.id)
            .maybeSingle();

        if (connectionErr) {
            captureError(connectionErr, { route: "google/feed-preview", merchantId: merchant.id, step: "load-store-code" });
        }

        const storeCode = resolveStoreCode(merchant.id, connection?.store_code);

        // Parité avec le feed réel : si le tier GTIN-only (D2) est actif, un produit GTIN+prix sans
        // image est publié → le preview doit le montrer comme publié (pas comme bloqué). Le flag est
        // lu UNE fois ici (comme `nowMs`) → cohérence intra-preview, même contrat que les 2 feeds.
        const allowMissingImage = gtinOnlyTierEnabled();
        // `nowMs` capturé UNE fois (parité feed) : une promo expirant pendant la boucle serait sinon
        // émise pour les 1ers produits et pas les derniers (incohérence intra-feed → ici intra-preview).
        const nowMs = Date.now();

        const wouldPublish: ReturnType<typeof transformProductToGoogle>[] = [];
        const blocked: BlockedProduct[] = [];

        for (const p of products) {
            const { eligible, reasons } = classifyFeedRow(p, { allowMissingImage });
            if (eligible) {
                // EAN/prix garantis non-null par le gate (classifyFeedRow) → transform sûr.
                wouldPublish.push(transformProductToGoogle(p as never, storeCode, nowMs));
            } else {
                blocked.push({ id: p.id, name: p.name, ean: p.ean, price: p.price, reasons });
            }
        }

        // Compteurs agrégés via la MÊME source que le KPI (`summarizePublishability`) → le preview et
        // le dashboard `/api/google/stats` racontent la même histoire (un seul vocabulaire de cause).
        const summary = summarizePublishability(products, { allowMissingImage });

        return NextResponse.json({
            merchant_id: merchant.id,
            store_code: storeCode,
            // Honnêteté sur blip DB : si la lecture connexion a ÉCHOUÉ (connectionErr, déjà tracé +
            // repli store_code), on NE PEUT PAS affirmer « connecté ». Émettre `false` (conservateur :
            // « pas prêt ») plutôt qu'un `connection !== null` qui dépendrait de null-vs-undefined du SDK
            // et risquerait un faux positif « connecté Google » sur un simple hoquet (interdit north-star).
            google_connected: connectionErr ? false : connection !== null,
            // Reflète l'état du flag tier GTIN-only (D2) au moment du preview : si ON, les produits
            // sans image apparaissent dans `would_publish` (sans `imageLink`) — le marchand le voit.
            gtin_only_tier: allowMissingImage,
            summary,
            // Le feed RÉEL qui partirait sur Google (payload exact, parité transform). Lecture seule.
            would_publish: wouldPublish,
            // Ce qui NE partirait PAS + pourquoi (par produit) → action directe du marchand.
            blocked,
        });
    } catch (err) {
        captureError(err, { route: "google/feed-preview" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

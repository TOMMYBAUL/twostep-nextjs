import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gtinOnlyTierEnabled } from "@/lib/google/feed-eligibility";
import { evaluateFeedReadiness } from "@/lib/google/pilot-readiness";
import { captureError } from "@/lib/error";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { computeSlaForPopulation, type SlaProductRow } from "@/lib/monitoring/merchant-sla";

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: merchant, error: merchantErr } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        // PGRST116 = aucune ligne (pas un profil marchand) → 403. Toute autre erreur DB
        // ≠ « pas de marchand » : la remonter (sinon un blip donnait un 403 trompeur).
        if (merchantErr && merchantErr.code !== "PGRST116") {
            captureError(merchantErr, { route: "google/stats", step: "load-merchant" });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
        }

        // Population = EXACTEMENT celle que le feed Google considère (parité avec
        // cron/google-feed + feed/lfp/[merchantId]) : visible + validated + non archivé +
        // non variante. Sinon le KPI « % publiable » surévalue en comptant des produits
        // que le feed exclut en silence (notamment un produit archivé reste visible=true,
        // cf. maillon 7 — même classe de faux positif).
        // PAGINÉ (KEYSET, cf. fetchAllRows) : un SELECT non borné est tronqué à 1000
        // lignes par PostgREST SANS erreur → au-delà de 1000 produits validés, le KPI
        // « % publiable » et la readiness LFP étaient calculés sur un sous-ensemble
        // silencieux (faux compteurs sur l'écran pilote). `id` ajouté au SELECT :
        // colonne-curseur du keyset. Population INCHANGÉE (parité feed : visible +
        // validated + non archivé + non variante).
        const { data: products, error: productsErr } = await fetchAllRows<
            SlaProductRow & { id: string }
        >(() =>
            supabase
                .from("products")
                // `stock(...)` : dimension FRAÎCHEUR du SLA G1 (source réelle + source_ts
                // honnête, migration 104) — même helper pur que le cron quality-check.
                .select("id, ean, price, photo_url, photo_processed_url, stock(quantity, updated_at, source, source_ts)")
                .eq("merchant_id", merchant.id)
                .eq("visible", true)
                .eq("review_status", "validated")
                .is("archived_at", null)
                .is("variant_of", null)
                .order("id", { ascending: true }),
        );

        // Échec de lecture ≠ « 0 produit » : sans cette garde, un blip DB renvoyait un KPI
        // all-zeros (faux « catalogue vide / 0 % publiable ») en silence sur la page Google.
        if (productsErr) {
            captureError(productsErr, { route: "google/stats", merchantId: merchant.id, step: "load-products" });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
        // data null SANS error = état SDK inattendu (un SELECT liste renvoie [] sur 0 ligne,
        // jamais null) : lever plutôt que renvoyer un KPI all-zeros = faux « catalogue vide »
        // (même garde défensive que cron/google-feed, parité du raisonnement anti-silence).
        if (!products) {
            captureError(new Error("products null without error — unexpected SDK state"), {
                route: "google/stats",
                merchantId: merchant.id,
                step: "load-products",
            });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }

        // `eligible_google`/`score` réutilisent le VRAI gate du feed (`isFeedEligible` via
        // summarizePublishability, embarqué dans le SLA) — image + prix>0 + GTIN≥8 inclus.
        // L'ancien proxy `ean && price !== null` comptait comme « éligibles » des produits sans
        // photo / au prix 0 / au GTIN tronqué que le feed rejette → KPI menteur (faux positif
        // pilote). Parité avec le feed réel : si le tier GTIN-only est actif, un produit
        // GTIN+prix sans image EST publié → il doit compter comme publiable ici aussi.
        // G1 : `computeSlaForPopulation` = summary publiabilité + dimension FRAÎCHEUR
        // (`computeStockConfidence` sur la source réelle) — MÊME helper que l'historique
        // quotidien du cron quality-check → la tuile et l'historique ne peuvent pas diverger.
        const s = computeSlaForPopulation(products, { allowMissingImage: gtinOnlyTierEnabled() });

        // Connexion Google Merchant : 2e signal (avec le seuil d'offres) de la readiness LFP.
        // `maybeSingle` → data=null SANS error sur 0 ligne (pas connecté), error sur vrai échec.
        // Un échec de lecture ≠ « pas connecté » : le distinguer (sinon on afficherait
        // faussement « pas prêt / non connecté » sur un blip DB) → 500 + captureError.
        const { data: connection, error: connectionErr } = await supabase
            .from("google_merchant_connections")
            .select("merchant_id")
            .eq("merchant_id", merchant.id)
            .maybeSingle();

        if (connectionErr) {
            captureError(connectionErr, { route: "google/stats", merchantId: merchant.id, step: "load-connection" });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }

        // Readiness LFP SOFTWARE : seuil d'offres publiables (≥ 11) atteint ET connecté à Google.
        // `publishable` = le gate réel du feed (pas un proxy) → le signal de readiness ne peut pas
        // diverger de ce qui publie réellement. Prérequis EXTERNES (Business Profile vérifié + lié,
        // « Request inventory verification ») = hors champ boucle → checklist go-live.
        const readiness = evaluateFeedReadiness({
            publishable: s.publishable,
            googleConnected: connection !== null,
        });

        return NextResponse.json({
            total_visible: s.total,
            eligible_google: s.publishable,
            missing_ean: s.missing_ean,
            missing_photo: s.missing_image,
            missing_price: s.missing_price,
            blocked_only_by_image: s.blocked_only_by_image,
            score: s.score,
            // SLA fraîcheur G1 (additif — les consommateurs existants ignorent ces champs) :
            // combien d'offres publiables EN STOCK, et combien sont « fraîches » (= seraient
            // affichées « Disponible » : source caisse récente + quantité saine).
            in_stock: s.in_stock,
            publishable_in_stock: s.publishable_in_stock,
            fresh_available: s.fresh_available,
            freshness_score: s.freshness_score,
            // Readiness LFP (item READINESS du backlog) — la checklist go-live lit ces champs.
            lfp_offers_threshold: readiness.threshold,
            lfp_meets_offer_threshold: readiness.meetsOfferThreshold,
            lfp_offer_shortfall: readiness.offerShortfall,
            google_connected: readiness.googleConnected,
            lfp_feed_ready: readiness.feedReady,
            lfp_blockers: readiness.blockers,
        });
    } catch (err) {
        captureError(err, { route: "google/stats" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

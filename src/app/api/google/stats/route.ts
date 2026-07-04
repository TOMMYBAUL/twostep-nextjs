import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizePublishability, gtinOnlyTierEnabled } from "@/lib/google/feed-eligibility";
import { evaluateFeedReadiness } from "@/lib/google/pilot-readiness";
import { captureError } from "@/lib/error";
import { fetchAllRows } from "@/lib/supabase/paginate";

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
        const { data: products, error: productsErr } = await fetchAllRows<{
            id: string;
            ean: string | null;
            price: number | null;
            photo_url: string | null;
            photo_processed_url: string | null;
        }>(() =>
            supabase
                .from("products")
                .select("id, ean, price, photo_url, photo_processed_url")
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
        // summarizePublishability) — image + prix>0 + GTIN≥8 inclus. L'ancien proxy
        // `ean && price !== null` comptait comme « éligibles » des produits sans photo / au
        // prix 0 / au GTIN tronqué que le feed rejette → KPI menteur (faux positif pilote).
        // Parité avec le feed réel : si le tier GTIN-only est actif, un produit GTIN+prix sans image
        // EST publié → il doit compter comme publiable ici aussi (sinon readiness sous-évaluée).
        const s = summarizePublishability(products, { allowMissingImage: gtinOnlyTierEnabled() });

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

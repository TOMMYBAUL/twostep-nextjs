import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizePublishability } from "@/lib/google/feed-eligibility";
import { captureError } from "@/lib/error";

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
        const { data: products, error: productsErr } = await supabase
            .from("products")
            .select("ean, price, photo_url, photo_processed_url")
            .eq("merchant_id", merchant.id)
            .eq("visible", true)
            .eq("review_status", "validated")
            .is("archived_at", null)
            .is("variant_of", null);

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
        const s = summarizePublishability(products);

        return NextResponse.json({
            total_visible: s.total,
            eligible_google: s.publishable,
            missing_ean: s.missing_ean,
            missing_photo: s.missing_image,
            missing_price: s.missing_price,
            blocked_only_by_image: s.blocked_only_by_image,
            score: s.score,
        });
    } catch (err) {
        captureError(err, { route: "google/stats" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

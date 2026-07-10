import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/error";

/**
 * G1 — historique quotidien du SLA fraîcheur/publiabilité du marchand connecté
 * (écrit par le cron `quality-check` via `computeMerchantSlaSnapshots`, migration 113).
 *
 * Lecture-seule, RLS (le marchand ne voit que SON historique — policy migration 113,
 * doublée du `.eq(merchant_id)` explicite). Lecture BORNÉE par construction : 1 ligne
 * par (marchand, jour) + `.limit(30)` → jamais plus de 30 lignes, pas de pagination.
 *
 * HONNÊTETÉ des états (north-star) — 3 états distincts, jamais confondus :
 *  - table absente (migration 113 NON appliquée, feature gated) → 200 `available:false`
 *    (« pas encore activé » ≠ « historique vide ») ;
 *  - vraie erreur DB → 500 (jamais un faux « aucun historique ») ;
 *  - table présente, 0 ligne → 200 `available:true, days:[]` (vide RÉEL).
 */
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
        // ≠ « pas de marchand » : la remonter (parité google/stats).
        if (merchantErr && merchantErr.code !== "PGRST116") {
            captureError(merchantErr, { route: "google/sla-history", step: "load-merchant" });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
        }

        const { data: days, error: daysErr } = await supabase
            .from("merchant_sla_history")
            .select("day, total, publishable, publishable_score, in_stock, publishable_in_stock, fresh_available, freshness_score")
            .eq("merchant_id", merchant.id)
            .order("day", { ascending: false })
            .limit(30);

        if (daysErr) {
            // 42P01 (relation inexistante) / PGRST205 (table hors schema cache) = la migration
            // 113 n'est pas appliquée → feature pas encore active. C'est un état ATTENDU du
            // déploiement gated, pas un échec : le dire tel quel (l'UI affiche « bientôt »),
            // sans Sentry (sinon bruit quotidien jusqu'au GO).
            if (daysErr.code === "42P01" || daysErr.code === "PGRST205") {
                return NextResponse.json({ available: false, days: [] });
            }
            captureError(daysErr, { route: "google/sla-history", merchantId: merchant.id, step: "load-history" });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
        // data null SANS error = anomalie SDK (un SELECT liste renvoie [] sur 0 ligne) :
        // lever plutôt qu'un faux « aucun historique » (même garde que google/stats).
        if (!days) {
            captureError(new Error("sla-history null without error — unexpected SDK state"), {
                route: "google/sla-history",
                merchantId: merchant.id,
                step: "load-history",
            });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }

        return NextResponse.json({ available: true, days });
    } catch (err) {
        captureError(err, { route: "google/sla-history" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

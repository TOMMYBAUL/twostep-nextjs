import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/error";

/**
 * G2 — historique de qualité du feed Google du marchand connecté (feed-quality report
 * type NearSt : served/pending/disapproved + top causes par run, écrit par le cron
 * `google-status` via `buildFeedRunRow`, migration 114).
 *
 * Lecture-seule, RLS (le marchand ne voit que SON historique — policy migration 114,
 * doublée du `.eq(merchant_id)` explicite). Lecture BORNÉE par construction : 1 ligne
 * par (marchand, jour) + `.limit(30)` → jamais plus de 30 lignes, pas de pagination.
 *
 * HONNÊTETÉ des états (north-star) — 3 états distincts, jamais confondus :
 *  - table absente (migration 114 NON appliquée, feature gated) → 200 `available:false`
 *    (« pas encore activé » ≠ « historique vide ») ;
 *  - vraie erreur DB → 500 (jamais un faux « aucun historique ») ;
 *  - table présente, 0 ligne → 200 `available:true, runs:[]` (vide RÉEL).
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
        // ≠ « pas de marchand » : la remonter (parité google/stats, sla-history).
        if (merchantErr && merchantErr.code !== "PGRST116") {
            captureError(merchantErr, { route: "google/feed-runs", step: "load-merchant" });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
        }

        const { data: runs, error: runsErr } = await supabase
            .from("google_feed_runs")
            .select("day, run_at, total, served, pending, disapproved, unknown, top_issues")
            .eq("merchant_id", merchant.id)
            .order("day", { ascending: false })
            .limit(30);

        if (runsErr) {
            // 42P01 (relation inexistante) / PGRST205 (table hors schema cache) = la migration
            // 114 n'est pas appliquée → feature pas encore active. C'est un état ATTENDU du
            // déploiement gated, pas un échec : le dire tel quel, sans Sentry (sinon bruit
            // quotidien jusqu'au GO).
            if (runsErr.code === "42P01" || runsErr.code === "PGRST205") {
                return NextResponse.json({ available: false, runs: [] });
            }
            captureError(runsErr, { route: "google/feed-runs", merchantId: merchant.id, step: "load-runs" });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }
        // data null SANS error = anomalie SDK (un SELECT liste renvoie [] sur 0 ligne) :
        // lever plutôt qu'un faux « aucun historique » (même garde que sla-history).
        if (!runs) {
            captureError(new Error("feed-runs null without error — unexpected SDK state"), {
                route: "google/feed-runs",
                merchantId: merchant.id,
                step: "load-runs",
            });
            return NextResponse.json({ error: "db_error" }, { status: 500 });
        }

        return NextResponse.json({ available: true, runs });
    } catch (err) {
        captureError(err, { route: "google/feed-runs" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

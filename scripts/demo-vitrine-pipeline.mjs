/**
 * P1 6a.2 — Vitrine DÉMO générée par le PIPELINE RÉEL (pas de hand-fake).
 *
 * Crée (ou réutilise) le marchand démo « Maison Garonne » (concept-store
 * beauté/lifestyle, Toulouse), pousse un catalogue RÉEL (19 EAN vérifiés sur
 * Open Beauty Facts + 2 lignes SKU-only) par la voie sans-caisse
 * POST /api/ingest/stock (jeton), fait tourner le VRAI worker cron
 * `enrich-products` jusqu'à épuisement des jobs, puis imprime un rapport
 * champ-par-champ (EAN → nom/marque/catégorie/score/photo/visible) pour le
 * jugement visuel de Thomas.
 *
 * Le marchand est taggé `launch_cohort=999` (convention démo du seed) →
 * nettoyable par --cleanup ou par le cleanup du seed démo.
 *
 * Usage :
 *   node scripts/demo-vitrine-pipeline.mjs http://localhost:3000            # crée + pousse + enrichit + rapport
 *   node scripts/demo-vitrine-pipeline.mjs http://localhost:3000 --report   # rapport seul (aucune écriture)
 *   node scripts/demo-vitrine-pipeline.mjs http://localhost:3000 --cleanup  # supprime marchand+user démo
 */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const baseUrl = process.argv[2]?.replace(/\/$/, "");
const mode = process.argv[3] ?? "--run";
if (!baseUrl) { console.error("Usage: node demo-vitrine-pipeline.mjs <base-url> [--report|--cleanup]"); process.exit(1); }

const env = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf-8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z]/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const CRON = env.CRON_SECRET;
if (!SB || !KEY || !CRON) { console.error("Supabase/CRON env manquant dans .env.local"); process.exit(1); }

const sbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (path) => `${SB}/rest/v1${path}`;

const DEMO_EMAIL = "demo-vitrine@twostep.fr";
const DEMO_NAME = "Maison Garonne";
const DEMO_COHORT = 999; // convention seed-demo-merchants.mjs

// Catalogue RÉEL : chaque EAN vérifié le 2026-07-09 sur Open Beauty Facts
// (produit existant, nom repris de la fiche, image présente sur OBF).
// 2 dernières lignes = SKU-only volontaires (montrent le triage honnête).
const CSV = [
    "code-barres;référence;nom;quantité;prix",
    "3264680011016;NUXE-HP100;Nuxe Huile prodigieuse 100 ml;4;32.90",
    "3264680004117;NUXE-SL;Nuxe Stick lèvres hydratant;6;6.50",
    "3264680028878;NUXE-SOL50;Nuxe Lait solaire fondant SPF50+ 150 ml;3;19.90",
    "3264680004964;NUXE-MEN-GD;Nuxe Men gel douche multi-usages 200 ml;5;9.90",
    "3522931033614;CAU-MAINS;Caudalie Vinotherapist Crème réparatrice mains et ongles;6;12.90",
    "3522930003595;CAU-LEVRES;Caudalie Soin des lèvres;8;5.90",
    "3282770141436;KLO-APS;Klorane Après-shampoing à la Quinine & Edelweiss 200 ml;4;8.90",
    "3282770141252;KLO-SHP;Klorane Shampooing 200 ml;5;9.50",
    "3596206529621;WEL-CHANGE;Weleda Bébé Calendula Crème pour le change 75 ml;4;8.50",
    "3401360104631;WEL-DEO;Weleda Déodorant roll-on 24h 50 ml;5;7.90",
    "3596200077555;WEL-SKINFOOD;Weleda Skin Food soin nourrissant texture légère 30 ml;3;12.90",
    "3401578653709;BIO-SEBIUM;Bioderma Sébium gel moussant 200 ml;6;10.90",
    "3401528520846;BIO-HDOUCHE;Bioderma Huile de douche 1 L;3;14.90",
    "3337875696548;LRP-LIPIKAR;La Roche-Posay Lipikar Baume AP+M 400 ml;4;19.90",
    "3337875863377;LRP-EFFACLAR;La Roche-Posay Effaclar Duo+ 40 ml;5;15.90",
    "3282770204681;AVE-CICALFATE;Avène Cicalfate Crème réparatrice 100 ml;4;11.90",
    "3282770139204;AVE-CLEANANCE;Avène Cleanance gel nettoyant 200 ml;5;12.50",
    "3253581768648;OCC-MAINS;L'Occitane Crème Mains Karité 150 ml;6;22.00",
    "3253581285886;OCC-STICK;L'Occitane Stick lèvres ultra riche;5;8.00",
    ";BGT-GARONNE-01;Bougie artisanale Garonne cire de soja 180 g;6;24.00",
    ";TOTE-GARONNE-01;Tote bag Maison Garonne coton bio;10;15.00",
].join("\n");

const j = async (res) => { try { return await res.json(); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findExisting() {
    const m = await j(await fetch(rest(`/merchants?name=eq.${encodeURIComponent(DEMO_NAME)}&select=id,user_id,slug`), { headers: sbHeaders }));
    return m?.[0] ?? null;
}

async function cleanup() {
    const existing = await findExisting();
    if (!existing) { console.log("Rien à nettoyer (marchand démo absent)."); return; }
    await fetch(rest(`/enrichment_jobs?merchant_id=eq.${existing.id}`), { method: "DELETE", headers: sbHeaders });
    const d = await fetch(rest(`/merchants?id=eq.${existing.id}`), { method: "DELETE", headers: sbHeaders });
    console.log(`suppression marchand: HTTP ${d.status}`);
    if (existing.user_id) {
        const du = await fetch(`${SB}/auth/v1/admin/users/${existing.user_id}`, { method: "DELETE", headers: sbHeaders });
        console.log(`suppression utilisateur: HTTP ${du.status}`);
    }
}

async function ensureMerchant() {
    const existing = await findExisting();
    if (existing) { console.log(`marchand démo existant réutilisé: ${existing.id} (slug ${existing.slug})`); return existing.id; }

    const userRes = await fetch(`${SB}/auth/v1/admin/users`, {
        method: "POST", headers: sbHeaders,
        body: JSON.stringify({ email: DEMO_EMAIL, email_confirm: true }),
    });
    const user = await j(userRes);
    if (!user?.id) throw new Error(`création user échouée: HTTP ${userRes.status} ${JSON.stringify(user)}`);

    const merchRes = await fetch(rest("/merchants"), {
        method: "POST", headers: { ...sbHeaders, Prefer: "return=representation" },
        body: JSON.stringify({
            user_id: user.id,
            name: DEMO_NAME,
            description: "Concept-store toulousain — soin, beauté et lifestyle. Nuxe, Caudalie, Klorane, Weleda, Bioderma, La Roche-Posay, Avène, L'Occitane.",
            address: "12 rue des Filatiers",
            city: "Toulouse",
            location: "SRID=4326;POINT(1.4437 43.5987)",
            status: "active",
            plan: "free",
            phone: "05 61 42 00 00",
            launch_cohort: DEMO_COHORT,
            opening_hours: {
                monday: { open: "10:00", close: "19:00" },
                tuesday: { open: "10:00", close: "19:00" },
                wednesday: { open: "10:00", close: "19:00" },
                thursday: { open: "10:00", close: "19:00" },
                friday: { open: "10:00", close: "19:30" },
                saturday: { open: "09:30", close: "19:30" },
            },
        }),
    });
    const merch = await j(merchRes);
    const id = merch?.[0]?.id;
    if (!id) throw new Error(`création marchand échouée: HTTP ${merchRes.status} ${JSON.stringify(merch)}`);
    console.log(`marchand démo créé: ${id} (slug ${merch[0].slug})`);
    return id;
}

async function ensureToken(merchantId) {
    const cur = await j(await fetch(rest(`/ingest_credentials?merchant_id=eq.${merchantId}&select=token`), { headers: sbHeaders }));
    if (cur?.[0]?.token) return cur[0].token;
    const token = crypto.randomBytes(24).toString("hex");
    const r = await fetch(rest("/ingest_credentials"), { method: "POST", headers: sbHeaders, body: JSON.stringify({ merchant_id: merchantId, token }) });
    if (!r.ok) throw new Error(`création jeton échouée: HTTP ${r.status}`);
    return token;
}

async function pushCatalog(token) {
    const r = await fetch(`${baseUrl}/api/ingest/stock?filename=maison-garonne.csv`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" }, body: CSV,
    });
    const body = await j(r);
    console.log(`push: HTTP ${r.status}`, JSON.stringify(body));
    if (r.status !== 200) throw new Error("push refusé");
    return body;
}

async function runWorkerUntilDone(merchantId) {
    for (let i = 1; i <= 12; i++) {
        const pending = await j(await fetch(rest(`/enrichment_jobs?merchant_id=eq.${merchantId}&status=eq.pending&select=id`), { headers: sbHeaders }));
        if (!pending || pending.length === 0) { console.log("plus aucun job pending."); return; }
        console.log(`worker passe ${i} — ${pending.length} job(s) pending…`);
        const w = await fetch(`${baseUrl}/api/cron/enrich-products`, { headers: { Authorization: `Bearer ${CRON}` } });
        console.log(`  worker: HTTP ${w.status}`, JSON.stringify(await j(w)));
        await sleep(3000);
    }
    console.log("⚠️ jobs toujours pending après 12 passes — voir enrichment_jobs.");
}

async function report(merchantId) {
    const products = await j(await fetch(
        rest(`/products?merchant_id=eq.${merchantId}&select=ean,sku,name,brand,category,price,identification_score,identification_tiers,review_status,visible,photo_url,photo_source,stock(quantity,source,source_ts)&order=name.asc`),
        { headers: sbHeaders },
    ));
    const jobs = await j(await fetch(rest(`/enrichment_jobs?merchant_id=eq.${merchantId}&select=status`), { headers: sbHeaders }));
    const m = await j(await fetch(rest(`/merchants?id=eq.${merchantId}&select=slug,name,status`), { headers: sbHeaders }));

    const rows = (products ?? []).map((p) => {
        const qty = Array.isArray(p.stock) ? p.stock[0]?.quantity : p.stock?.quantity;
        return `| ${p.ean ?? "—"} | ${p.name} | ${p.brand ?? "∅"} | ${p.category ?? "∅"} | ${p.price ?? "∅"} | ${qty ?? "∅"} | ${p.identification_score ?? "∅"} | ${p.review_status ?? "∅"} | ${p.visible ? "OUI" : "non"} | ${p.photo_url ? `${p.photo_source ?? "?"}` : "∅"} |`;
    });
    const counts = {
        total: products?.length ?? 0,
        visibles: (products ?? []).filter((p) => p.visible).length,
        validated: (products ?? []).filter((p) => p.review_status === "validated").length,
        pending: (products ?? []).filter((p) => p.review_status === "pending").length,
        avec_photo: (products ?? []).filter((p) => p.photo_url).length,
        jobs: (jobs ?? []).reduce((acc, x) => ((acc[x.status] = (acc[x.status] ?? 0) + 1), acc), {}),
    };
    console.log("\n===== RAPPORT VITRINE DÉMO =====");
    console.log(`marchand: ${m?.[0]?.name} — /shop/${m?.[0]?.slug} — status ${m?.[0]?.status}`);
    console.log(JSON.stringify(counts));
    console.log("\n| EAN | Nom déclaré | Marque | Catégorie | Prix | Qté | Score | Review | Visible | Photo |");
    console.log("|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rows) console.log(r);
}

if (mode === "--cleanup") {
    await cleanup();
} else if (mode === "--report") {
    const existing = await findExisting();
    if (!existing) { console.error("marchand démo absent"); process.exit(1); }
    await report(existing.id);
} else {
    const merchantId = await ensureMerchant();
    const token = await ensureToken(merchantId);
    await pushCatalog(token);
    await runWorkerUntilDone(merchantId);
    await report(merchantId);
}

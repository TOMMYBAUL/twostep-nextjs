/**
 * E2E ingestion — à lancer contre un déploiement preview.
 *
 * Crée un marchand de test jetable, pousse un CSV mixte (EAN/SKU/nom seul),
 * vérifie triage + REPLACE + sécurité, PUIS valide le découplage V2 :
 * job d'enrichissement enfilé → worker cron → produit enrichi/scoré, et
 * l'idempotence (re-push identique = no-op). Nettoie tout à la fin.
 *
 * Usage : node scripts/e2e-ingest-preview.mjs https://<preview-url>
 */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const previewUrl = process.argv[2]?.replace(/\/$/, "");
if (!previewUrl) { console.error("Usage: node e2e-ingest-preview.mjs <preview-url>"); process.exit(1); }

const env = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf-8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z]/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const CRON = env.CRON_SECRET;
if (!SB || !KEY) { console.error("Supabase env manquant dans .env.local"); process.exit(1); }

const sbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (path) => `${SB}/rest/v1${path}`;

let failures = 0;
const check = (label, ok, detail = "") => {
    console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};
const stockQty = (s) => (Array.isArray(s) ? s[0]?.quantity : s?.quantity);

let userId, merchantId, token;
try {
    const userRes = await fetch(`${SB}/auth/v1/admin/users`, {
        method: "POST", headers: sbHeaders,
        body: JSON.stringify({ email: `e2e-${Date.now()}@test.twostep.fr`, email_confirm: true }),
    });
    userId = (await userRes.json()).id;
    check("création utilisateur test", !!userId);

    const merchRes = await fetch(rest("/merchants"), {
        method: "POST", headers: { ...sbHeaders, Prefer: "return=representation" },
        body: JSON.stringify({
            user_id: userId, name: "E2E TEST INGEST — IGNORER", address: "1 rue du Test",
            city: "Toulouse", location: "SRID=4326;POINT(1.4442 43.6047)", status: "pending",
        }),
    });
    merchantId = (await merchRes.json())[0]?.id;
    check("création marchand test", !!merchantId);

    token = crypto.randomBytes(24).toString("hex");
    const credRes = await fetch(rest("/ingest_credentials"), {
        method: "POST", headers: sbHeaders, body: JSON.stringify({ merchant_id: merchantId, token }),
    });
    check("création jeton d'ingestion", credRes.ok);

    const csv = [
        "code-barres;référence;nom;taille;quantité;prix",
        "3017620422003;;Nutella 750g;;5;3.50",
        ";TS-E2E-001;Bougie artisanale;;2;14.90",
        ";;Produit sans aucun code;;9;9.99",
        ";DD1391-100;Nike Dunk Low;42;3;120",       // multi-tailles via COLONNE taille
        ";DD1391-100;Nike Dunk Low;43;2;120",
    ].join("\n");
    const push = async (body) => {
        const r = await fetch(`${previewUrl}/api/ingest/stock?filename=stock.csv`, {
            method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" }, body,
        });
        return { code: r.status, json: await r.json() };
    };

    // ── 1. Push initial ──
    const p1 = await push(csv);
    console.log("push 1:", JSON.stringify(p1.json));
    check("push accepté (200)", p1.code === 200);
    check("triage 1 GTIN / 3 SKU / 1 rejet",
        p1.json.triage?.gtin_lines === 1 && p1.json.triage?.sku_lines === 3 && p1.json.triage?.rejected_lines === 1,
        JSON.stringify(p1.json.triage));
    check("3 produits créés (nutella, bougie, nike groupé)", p1.json.products_created === 3, `créés=${p1.json.products_created}`);

    // ── 1bis. TAILLE : colonne dédiée → available_sizes avec source tracée ──
    const nike = await (await fetch(rest(`/products?merchant_id=eq.${merchantId}&select=name,sku,available_sizes&sku=eq.DD1391-100`), { headers: sbHeaders })).json();
    const sizes = nike[0]?.available_sizes ?? [];
    const sizeVals = sizes.map((s) => s.size).sort();
    check("Nike groupé : 2 tailles depuis la colonne", sizeVals.length === 2 && sizeVals[0] === "42" && sizeVals[1] === "43", JSON.stringify(sizeVals));
    check("tailles tracées source=file_column (fiable)", sizes.every((s) => s.source === "file_column"), JSON.stringify(sizes.map((s) => s.source)));
    check("quantité par taille correcte (42→3, 43→2)",
        sizes.find((s) => s.size === "42")?.quantity === 3 && sizes.find((s) => s.size === "43")?.quantity === 2, JSON.stringify(sizes));

    // ── 2. Découplage : jobs d'enrichissement enfilés (pas d'enrichissement inline) ──
    const jobs1 = await (await fetch(rest(`/enrichment_jobs?merchant_id=eq.${merchantId}&select=id,product_id,status`), { headers: sbHeaders })).json();
    check("3 jobs d'enrichissement enfilés (pending)", jobs1.length === 3 && jobs1.every((j) => j.status === "pending"), `${jobs1.length} jobs`);

    // ── 3. État avant worker : produits créés mais PAS encore scorés (invisibles) ──
    const before = await (await fetch(rest(`/products?merchant_id=eq.${merchantId}&select=id,ean,visible,review_status,identification_score,stock(quantity)`), { headers: sbHeaders })).json();
    const nutellaBefore = before.find((p) => p.ean === "3017620422003");
    check("produit EAN créé, stock 5, invisible avant enrichissement",
        stockQty(nutellaBefore?.stock) === 5 && nutellaBefore?.visible === false,
        `found=${!!nutellaBefore} stock=${stockQty(nutellaBefore?.stock)} visible=${nutellaBefore?.visible} status=${nutellaBefore?.review_status} score=${nutellaBefore?.identification_score}`);

    // ── 4. Worker d'enrichissement (cron) ──
    if (!CRON) {
        check("CRON_SECRET présent pour tester le worker", false, "absent de .env.local — worker non testé");
    } else {
        const w = await fetch(`${previewUrl}/api/cron/enrich-products`, { headers: { Authorization: `Bearer ${CRON}` } });
        const wj = await w.json();
        console.log("worker:", w.status, JSON.stringify(wj));
        check("worker répond 200", w.status === 200, `HTTP ${w.status}`);
        check("worker a traité les 3 jobs", wj.processed >= 3 || wj.done >= 3, JSON.stringify(wj));

        const jobs2 = await (await fetch(rest(`/enrichment_jobs?merchant_id=eq.${merchantId}&select=status`), { headers: sbHeaders })).json();
        check("jobs terminés (plus aucun pending)", jobs2.every((j) => j.status !== "pending"), JSON.stringify(jobs2.map((j) => j.status)));

        const after = await (await fetch(rest(`/products?merchant_id=eq.${merchantId}&ean=eq.3017620422003&select=identification_score,visible,canonical_name`), { headers: sbHeaders })).json();
        check("produit EAN enrichi (score calculé)", after[0]?.identification_score != null, `score=${after[0]?.identification_score}, name=${after[0]?.canonical_name}`);
    }

    // ── 5. Idempotence : re-push du MÊME fichier → no-op ──
    const p2 = await push(csv);
    check("re-push identique → status unchanged", p2.json.status === "unchanged", JSON.stringify(p2.json.status));

    // ── 6. Sécurité : jeton invalide → 401 ──
    const bad = await fetch(`${previewUrl}/api/ingest/stock`, {
        method: "POST", headers: { Authorization: "Bearer invalide", "Content-Type": "text/csv" }, body: csv,
    });
    check("jeton invalide rejeté (401)", bad.status === 401);
} finally {
    if (merchantId) {
        await fetch(rest(`/enrichment_jobs?merchant_id=eq.${merchantId}`), { method: "DELETE", headers: sbHeaders });
        const d = await fetch(rest(`/merchants?id=eq.${merchantId}`), { method: "DELETE", headers: sbHeaders });
        console.log(`nettoyage marchand: HTTP ${d.status}`);
    }
    if (userId) {
        const du = await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: sbHeaders });
        console.log(`nettoyage utilisateur: HTTP ${du.status}`);
    }
}

console.log(failures === 0 ? "\nE2E: TOUT VERT" : `\nE2E: ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);

/**
 * E2E ingestion — à lancer contre un déploiement preview.
 *
 * Crée un marchand de test jetable (utilisateur auth + merchant + jeton
 * d'ingestion), pousse un CSV mixte (EAN valide / SKU / nom seul) sur
 * /api/ingest/stock, vérifie le triage et l'état du stock en base, puis
 * NETTOIE tout (delete merchant cascade + user).
 *
 * Usage : node scripts/e2e-ingest-preview.mjs https://<preview-url>
 * Lit NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY depuis .env.local.
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
if (!SB || !KEY) { console.error("Supabase env manquant dans .env.local"); process.exit(1); }

const sbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (path) => `${SB}/rest/v1${path}`;

let failures = 0;
const check = (label, ok, detail = "") => {
    console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

let userId, merchantId;
try {
    // 1. Utilisateur + marchand de test
    const userRes = await fetch(`${SB}/auth/v1/admin/users`, {
        method: "POST",
        headers: sbHeaders,
        body: JSON.stringify({ email: `e2e-${Date.now()}@test.twostep.fr`, email_confirm: true }),
    });
    const user = await userRes.json();
    userId = user.id;
    check("création utilisateur test", !!userId, userId ?? JSON.stringify(user));

    const merchRes = await fetch(rest("/merchants"), {
        method: "POST",
        headers: { ...sbHeaders, Prefer: "return=representation" },
        body: JSON.stringify({
            user_id: userId,
            name: "E2E TEST INGEST — IGNORER",
            address: "1 rue du Test",
            city: "Toulouse",
            location: "SRID=4326;POINT(1.4442 43.6047)",
            status: "pending",
        }),
    });
    const merch = (await merchRes.json())[0];
    merchantId = merch?.id;
    check("création marchand test (status pending, invisible)", !!merchantId, merchantId);

    const token = crypto.randomBytes(24).toString("hex");
    const credRes = await fetch(rest("/ingest_credentials"), {
        method: "POST",
        headers: sbHeaders,
        body: JSON.stringify({ merchant_id: merchantId, token }),
    });
    check("création jeton d'ingestion", credRes.ok, String(credRes.status));

    // 2. Push CSV mixte : 1 EAN valide, 1 SKU interne, 1 nom seul (doit être rejeté)
    const csv = [
        "code-barres;référence;nom;quantité;prix",
        "3017620422003;;Nutella 750g;5;3.50",
        ";TS-E2E-001;Bougie artisanale;2;14.90",
        ";;Produit sans aucun code;9;9.99",
    ].join("\n");

    const pushRes = await fetch(`${previewUrl}/api/ingest/stock?filename=stock.csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" },
        body: csv,
    });
    const push = await pushRes.json();
    console.log("réponse push:", JSON.stringify(push));
    check("push accepté (HTTP 200)", pushRes.status === 200, `HTTP ${pushRes.status}`);
    check("triage: 1 ligne GTIN", push.triage?.gtin_lines === 1);
    check("triage: 1 ligne SKU", push.triage?.sku_lines === 1);
    check("triage: 1 ligne rejetée (nom seul)", push.triage?.rejected_lines === 1);
    check("2 produits créés", push.products_created === 2);
    check("status partial (rejets présents)", push.status === "partial", push.status);

    // 3. Vérification en base
    const prodRes = await fetch(rest(`/products?merchant_id=eq.${merchantId}&select=id,name,ean,sku,visible,review_status,stock(quantity)`), { headers: sbHeaders });
    const prods = await prodRes.json();
    check("2 produits en base", prods.length === 2, `${prods.length}`);
    const eanProd = prods.find((p) => p.ean === "3017620422003");
    const skuProd = prods.find((p) => p.sku === "TS-E2E-001");
    check("produit EAN présent, stock 5", eanProd?.stock?.[0]?.quantity === 5 || eanProd?.stock?.quantity === 5, JSON.stringify(eanProd?.stock));
    check("produit SKU présent, stock 2, invisible", (skuProd?.stock?.[0]?.quantity === 2 || skuProd?.stock?.quantity === 2) && skuProd?.visible === false, JSON.stringify({ v: skuProd?.visible }));
    check("aucun produit nom-seul créé", !prods.some((p) => p.name.includes("sans aucun code")));

    // 4. Idempotence + réconciliation : re-push avec l'EAN à 0 exemplaires restants
    const csv2 = [
        "code-barres;référence;nom;quantité;prix",
        "3017620422003;;Nutella 750g;0;3.50",
        ";TS-E2E-001;Bougie artisanale;2;14.90",
    ].join("\n");
    const push2Res = await fetch(`${previewUrl}/api/ingest/stock?filename=stock.csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" },
        body: csv2,
    });
    const push2 = await push2Res.json();
    check("re-push accepté", push2Res.status === 200, `HTTP ${push2Res.status}`);
    const prod2Res = await fetch(rest(`/products?merchant_id=eq.${merchantId}&ean=eq.3017620422003&select=stock(quantity)`), { headers: sbHeaders });
    const prod2 = await prod2Res.json();
    const q2 = prod2[0]?.stock?.[0]?.quantity ?? prod2[0]?.stock?.quantity;
    check("REPLACE : stock EAN passé 5 → 0", q2 === 0, `quantity=${q2}`);

    // 5. Jeton invalide → 401
    const badRes = await fetch(`${previewUrl}/api/ingest/stock`, {
        method: "POST",
        headers: { Authorization: "Bearer invalide", "Content-Type": "text/csv" },
        body: csv,
    });
    check("jeton invalide rejeté (401)", badRes.status === 401, `HTTP ${badRes.status}`);
} finally {
    // 6. Nettoyage complet
    if (merchantId) {
        const del = await fetch(rest(`/merchants?id=eq.${merchantId}`), { method: "DELETE", headers: sbHeaders });
        console.log(`nettoyage marchand: HTTP ${del.status}`);
    }
    if (userId) {
        const delU = await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: sbHeaders });
        console.log(`nettoyage utilisateur: HTTP ${delU.status}`);
    }
}

console.log(failures === 0 ? "\nE2E: TOUT VERT" : `\nE2E: ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);

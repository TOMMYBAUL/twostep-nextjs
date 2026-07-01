import { describe, it, expect, vi } from "vitest";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";

// groupVariantsByEAN (post-pass regroupage variantes) et l'enrichissement async ne
// sont PAS l'objet du maillon 3 (ils ont leurs propres tests). On les inerte pour
// isoler la logique items→products : match (EAN>SKU>nom), create vs update, 0 doublon.
vi.mock("@/lib/pos/sync-engine", () => ({ groupVariantsByEAN: vi.fn() }));
vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

/**
 * VALIDATION MAILLON 3 du workflow cœur — INGEST / MATCH (items → `products`).
 *
 * Méthode qualité (priorities §1bis) : pas « le test unitaire passe » mais le
 * maillon exécuté de bout en bout sur une vraie entrée sale (CSV FR → parse →
 * ingest AVEC ÉCRITURES), table `products`/`stock` résultante inspectée champ par
 * champ. La promesse north-star prouvée ici : « capter sans rien oublier ET
 * SANS créer de doublon » — un même produit physique (même EAN/SKU/nom) ne doit
 * JAMAIS engendrer deux lignes catalogue, quel que soit le canal (fichier vs POS)
 * ou la répétition des push.
 *
 * Les tests existants (`ingest-snapshot.test.ts`) ne couvraient que les LECTURES
 * en dryRun (aucune écriture). Ici on prouve le chemin RÉEL create/update.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Faux client Supabase STATEFUL : applique réellement insert/update/upsert sur un
// store en mémoire, pour pouvoir inspecter l'état final (≠ faux client dryRun qui
// ne fait que résoudre des lectures). Couvre exactement les chaînes de snapshot.ts.
// ─────────────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
type Store = { products: Row[]; stock: Row[]; feed_events: Row[]; enrichment_jobs: Row[] };

function makeStatefulAdmin(seed: Partial<Store> = {}) {
    const db: Store = {
        products: (seed.products ?? []).map((r) => ({ ...r })),
        stock: (seed.stock ?? []).map((r) => ({ ...r })),
        feed_events: [],
        enrichment_jobs: [],
    };

    function apply(table: keyof Store, st: ApplyState): { data: unknown; error: null } {
        if (st.op === "insert") {
            const rows = Array.isArray(st.payload) ? st.payload : [st.payload];
            for (const r of rows) db[table].push({ ...(r as Row) });
            return { data: null, error: null };
        }
        if (st.op === "upsert") {
            // stock : onConflict product_id → REPLACE la ligne existante, sinon insert.
            // Le flush batché (SCALE) upsert un TABLEAU → itérer chaque ligne.
            const rows = Array.isArray(st.payload) ? (st.payload as Row[]) : [st.payload as Row];
            for (const r of rows) {
                const idx = db[table].findIndex((x) => x.product_id === r.product_id);
                if (idx >= 0) db[table][idx] = { ...db[table][idx], ...r };
                else db[table].push({ ...r });
            }
            return { data: null, error: null };
        }
        if (st.op === "update") {
            for (const row of db[table]) if (row.id === st.filters.id) Object.assign(row, st.payload);
            return { data: null, error: null };
        }
        if (st.op === "update_in") {
            for (const row of db[table]) {
                if (st.inVals!.includes(row[st.inCol!] as string)) Object.assign(row, st.payload);
            }
            return { data: null, error: null };
        }
        // SELECT
        if (table === "products") {
            const mid = st.filters.merchant_id;
            return {
                data: db.products
                    .filter((p) => p.merchant_id === mid)
                    .map((p) => ({ id: p.id, ean: p.ean, name: p.name, sku: p.sku })),
                error: null,
            };
        }
        if (table === "stock") {
            // Lecture réconciliation : join products.merchant_id, quantity > 0.
            const mid = st.filters["products.merchant_id"];
            const rows = db.stock.filter(
                (s) => (s.quantity as number) > 0 && db.products.some((p) => p.id === s.product_id && p.merchant_id === mid),
            );
            return { data: rows.map((s) => ({ product_id: s.product_id, quantity: s.quantity })), error: null };
        }
        return { data: [], error: null };
    }

    type ApplyState = {
        op: "select" | "insert" | "update" | "upsert" | "update_in";
        filters: Record<string, unknown>;
        payload: unknown;
        inCol: string | null;
        inVals: string[] | null;
    };

    function from(table: keyof Store) {
        const st: ApplyState = { op: "select", filters: {}, payload: null, inCol: null, inVals: null };
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = (col: string, val: unknown) => {
            st.filters[col] = val;
            return b;
        };
        b.gt = () => b; // quantity>0 : déjà appliqué dans le SELECT stock
        b.order = () => b; // ordre déterministe pagination : insertion = ordre stable
        b.range = () => b; // pagination fetchAllRows : petit dataset = 1 page, no-op
        b.insert = (payload: unknown) => {
            st.op = "insert";
            st.payload = payload;
            return b;
        };
        b.update = (payload: unknown) => {
            if (st.op !== "update_in") st.op = "update";
            st.payload = payload;
            return b;
        };
        b.upsert = (payload: unknown) => {
            st.op = "upsert";
            st.payload = payload;
            return b;
        };
        b.in = (col: string, vals: string[]) => {
            st.op = "update_in"; // .in() n'est utilisé que pour le passage à 0 (update)
            st.inCol = col;
            st.inVals = vals;
            return b;
        };
        b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            return Promise.resolve(apply(table, st)).then(resolve, reject);
        };
        return b;
    }

    return { admin: { from } as never, db };
}

const M = "merchant-maillon3";

// Export FR sale : `;`, en-têtes accentués, EAN-13 / UPC-12 / SKU / nom-seul.
const DIRTY_CSV = [
    "Code-barres;Désignation;Référence;Quantité;Prix",
    "3017620422003;Nutella 750g;;6;4,50", //         EAN-13 valide       → create gtin
    "036000291452;Coca canette;;24;0,80", //         UPC-12 → 0036…       → create gtin
    ";T-shirt logo;TS-0042;7;15,00", //              SKU                  → create sku
    ";Bougie lavande;;1;6,00", //                    nom seul            → REJET (jamais créé)
].join("\n");

describe("MAILLON 3 — premier push sur catalogue vide (CREATE), inspecté champ par champ", () => {
    const { admin, db } = makeStatefulAdmin();
    let result: Awaited<ReturnType<typeof ingestStockSnapshot>>;

    it("PREUVE : 3 produits créés (le nom-seul rejeté n'engendre AUCUNE ligne)", async () => {
        const { items, coverage } = parseStockFile(Buffer.from(DIRTY_CSV, "utf-8"));
        result = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
        // eslint-disable-next-line no-console
        console.log("PRODUCTS APRÈS PUSH 1:\n" + JSON.stringify(db.products, null, 2));
        // eslint-disable-next-line no-console
        console.log("STOCK APRÈS PUSH 1:\n" + JSON.stringify(db.stock, null, 2));

        expect(result.products_created).toBe(3);
        expect(result.products_updated).toBe(0);
        expect(db.products).toHaveLength(3); // la ligne « Bougie lavande » (nom seul) NON créée
    });

    it("EAN-13 → produit créé invisible (gate cascade), EAN conservé, prix + stock corrects", () => {
        const nutella = db.products.find((p) => p.name === "Nutella 750g")!;
        expect(nutella).toMatchObject({ ean: "3017620422003", sku: null, price: 4.5, visible: false, review_status: "pending" });
        const stock = db.stock.find((s) => s.product_id === nutella.id)!;
        expect(stock).toMatchObject({ quantity: 6, source: "file_push" });
    });

    it("UPC-12 → EAN-13 canonicalisé (préfixe 0) au moment du CREATE (cohérence cross-canal)", () => {
        const coca = db.products.find((p) => p.name === "Coca canette")!;
        expect(coca).toMatchObject({ ean: "0036000291452" });
    });

    it("SKU seul → produit créé avec sku, ean null (jamais une fausse identité GTIN)", () => {
        const tshirt = db.products.find((p) => p.name === "T-shirt logo")!;
        expect(tshirt).toMatchObject({ ean: null, sku: "TS-0042", price: 15 });
        expect(db.stock.find((s) => s.product_id === tshirt.id)).toMatchObject({ quantity: 7 });
    });

    it("chaque nouveau produit est enfilé pour enrichissement (rien d'oublié en aval)", () => {
        expect(db.enrichment_jobs).toHaveLength(3);
    });
});

describe("MAILLON 3 — re-push du MÊME fichier : idempotence, ZÉRO doublon", () => {
    it("le 2e push matche tout (EAN + SKU) → 0 créé, 3 mis à jour, table inchangée", async () => {
        const { admin, db } = makeStatefulAdmin();
        const { items, coverage } = parseStockFile(Buffer.from(DIRTY_CSV, "utf-8"));

        const first = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
        expect(first.products_created).toBe(3);

        const second = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
        // eslint-disable-next-line no-console
        console.log("PUSH 2 result:\n" + JSON.stringify({ created: second.products_created, updated: second.products_updated }, null, 2));

        expect(second.products_created).toBe(0); // ← l'invariant « 0 doublon »
        expect(second.products_updated).toBe(3);
        expect(db.products).toHaveLength(3); // toujours 3, aucune ligne dupliquée
        expect(db.enrichment_jobs).toHaveLength(3); // aucun ré-enfilement (pas de nouveau produit)
    });
});

describe("MAILLON 3 — anti-doublon CROSS-CANAL : un produit déjà créé par le POS matche le fichier", () => {
    it("EAN canonicalisé : produit POS en EAN-13, fichier en UPC-12 → 1 seul produit (UPDATE)", async () => {
        // Produit déjà présent comme s'il venait de la caisse, EAN canonique 13 chiffres.
        const { admin, db } = makeStatefulAdmin({
            products: [{ id: "pos-coca", merchant_id: M, ean: "0036000291452", name: "Coca POS", sku: null, visible: true }],
            stock: [{ product_id: "pos-coca", quantity: 99, source: "pos_sync" }],
        });
        // Le fichier apporte le MÊME produit en UPC-12 (12 chiffres) → triage canonicalise.
        const csv = ["Code-barres;Désignation;Quantité;Prix", "036000291452;Coca canette;24;0,80"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage });
        expect(r.products_created).toBe(0); // pas un doublon malgré le format d'EAN différent
        expect(r.products_updated).toBe(1);
        expect(db.products).toHaveLength(1);
        // Le stock du fichier REMPLACE celui du POS (sémantique snapshot file_push).
        expect(db.stock.find((s) => s.product_id === "pos-coca")).toMatchObject({ quantity: 24, source: "file_push" });
    });

    it("SKU casse-insensible : produit POS sku 'ts-0042', fichier 'TS-0042' → UPDATE, pas de doublon", async () => {
        const { admin, db } = makeStatefulAdmin({
            products: [{ id: "pos-tshirt", merchant_id: M, ean: null, name: "Tshirt POS", sku: "ts-0042", visible: true }],
            stock: [{ product_id: "pos-tshirt", quantity: 3, source: "pos_sync" }],
        });
        const csv = ["Référence;Désignation;Quantité;Prix", "TS-0042;T-shirt logo;7;15,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage });
        expect(r.products_created).toBe(0);
        expect(r.products_updated).toBe(1);
        expect(db.products).toHaveLength(1);
    });
});

describe("MAILLON 3 — le NOM dédoublonne l'existant quand l'identité a changé (anti-doublon)", () => {
    it("produit existant matché par NOM (EAN/SKU ne matchent pas) → UPDATE, pas de doublon", async () => {
        // Produit legacy connu par son nom, avec un ancien SKU. Le fichier le réimporte
        // avec un SKU DIFFÉRENT (réétiquetage) → ni EAN ni SKU ne matchent, mais le nom oui.
        const { admin, db } = makeStatefulAdmin({
            products: [{ id: "leg-bougie", merchant_id: M, ean: null, name: "Bougie Parfumée", sku: "OLD-SKU", visible: true }],
            stock: [{ product_id: "leg-bougie", quantity: 2, source: "manual" }],
        });
        const csv = ["Référence;Désignation;Quantité;Prix", "NEW-SKU;Bougie Parfumée;5;6,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage });
        expect(r.products_created).toBe(0); // le nom a évité le doublon
        expect(r.products_updated).toBe(1);
        expect(db.products).toHaveLength(1);
    });
});

describe("MAILLON 3 — dédoublonnage INTRA-push : même EAN sur deux libellés → 1 seul produit", () => {
    it("deux lignes même EAN, noms de base différents → CREATE puis UPDATE (jamais 2 produits)", async () => {
        const { admin, db } = makeStatefulAdmin();
        // Même code-barres, deux libellés distincts dans le MÊME fichier (incohérence
        // d'export). L'EAN identifie UN produit → la 2e ligne doit matcher la 1re.
        const csv = [
            "Code-barres;Désignation;Quantité;Prix",
            "3017620422003;Nutella;5;4,50",
            "3017620422003;Nutella Edition Speciale;3;5,00",
        ].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage });
        // eslint-disable-next-line no-console
        console.log("INTRA-PUSH même EAN:\n" + JSON.stringify(db.products, null, 2));

        expect(r.products_created).toBe(1); // ← un seul produit pour un seul EAN
        expect(db.products).toHaveLength(1);
        expect(db.products[0]).toMatchObject({ ean: "3017620422003" });
        // NB sémantique REPLACE : la 2e ligne (même EAN) écrase le stock de la 1re —
        // le stock final reflète la DERNIÈRE ligne du même EAN, pas la somme. Un même
        // EAN ne peut porter qu'une quantité ; un fichier qui le liste deux fois est
        // incohérent côté marchand, « dernière valeur » est défendable.
        expect(db.stock.find((s) => s.product_id === db.products[0].id)).toMatchObject({ quantity: 3 });
    });
});

import { describe, it, expect, vi } from "vitest";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";

// Le post-pass groupVariantsByEAN et l'enrichissement async ont leurs propres tests.
// On les inerte pour isoler la RÉCONCILIATION (décrémentation des absents).
vi.mock("@/lib/pos/sync-engine", () => ({ groupVariantsByEAN: vi.fn() }));
vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

/**
 * VALIDATION MAILLON 4 du workflow cœur — RÉCONCILIATION DE DÉCRÉMENTATION.
 *
 * Méthode qualité (priorities §1bis) : pas « le test unitaire passe » mais le
 * maillon exécuté de bout en bout sur une vraie entrée sale (CSV FR → parse →
 * ingest AVEC ÉCRITURES), table `stock`/`products`/`feed_events` résultante
 * inspectée champ par champ.
 *
 * Invariant north-star prouvé ici (« afficher honnêtement, zéro faux positif ») :
 *   1. Un article EN STOCK mais ABSENT du nouveau push (vendu, sorti de l'export)
 *      passe à quantity=0, source="file_push" (le push décide l'épuisement), et
 *      un `feed_events` out_of_stock est émis. Sinon il resterait affiché « en
 *      stock » = LE faux positif qui tue la confiance.
 *   2. JAMAIS d'écrasement silencieux : un fichier tronqué (couverture anormale
 *      d'un gros catalogue) ou illisible (0 ligne exploitable) n'efface PAS la
 *      boutique → réconciliation ANNULÉE + erreur visible, stock préservé.
 *   3. Un produit sized décrémenté à 0 voit son `available_sizes` vidé (sinon la
 *      fiche produit afficherait des pointures « disponibles » périmées).
 *
 * Le `ingest-reconcile.test.ts` existant ne couvrait que le helper PUR
 * (`selectProductsToZero`/`chunk`) en isolation. Ici on prouve le CHEMIN
 * D'ÉCRITURE réel à travers `ingestStockSnapshot`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Faux client Supabase STATEFUL (cf. maillon 3) : applique réellement
// insert/update/upsert/update-in sur un store mémoire → on inspecte l'état final.
// Étendu pour le maillon 4 : porte `available_sizes`, lecture de réconciliation
// (stock quantity>0 join merchant), et `.in()` générique (stock.product_id OU
// products.id) pour le passage à 0 + le vidage des tailles.
// ─────────────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
type Store = { products: Row[]; stock: Row[]; feed_events: Row[]; enrichment_jobs: Row[] };

type ApplyState = {
    op: "select" | "insert" | "update" | "upsert" | "update_in";
    filters: Record<string, unknown>;
    payload: unknown;
    inCol: string | null;
    inVals: string[] | null;
};

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
            // stock onConflict product_id → REPLACE. Le flush batché (SCALE) upsert un
            // TABLEAU de lignes → itérer chacune.
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
            // .in(col, vals) : stock → col="product_id" (passage à 0) ;
            //                  products → col="id" (vidage available_sizes).
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
            // Lecture de réconciliation : join products.merchant_id, quantity>0.
            const mid = st.filters["products.merchant_id"];
            const rows = db.stock.filter(
                (s) => (s.quantity as number) > 0 && db.products.some((p) => p.id === s.product_id && p.merchant_id === mid),
            );
            return { data: rows.map((s) => ({ product_id: s.product_id, quantity: s.quantity })), error: null };
        }
        return { data: [], error: null };
    }

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
            st.op = "update_in";
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

const M = "merchant-maillon4";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

describe("MAILLON 4 — décrémentation honnête : l'absent du push passe à 0", () => {
    // Petit catalogue (2 produits) : le garde-fou de couverture ne s'applique pas
    // (< minCatalogForGuard=10) → une grosse variation est normale.
    const seed = {
        products: [
            { id: "p-nutella", merchant_id: M, ean: "3017620422003", name: "Nutella 750g", sku: null, visible: true, available_sizes: [] },
            {
                id: "p-sneaker",
                merchant_id: M,
                ean: null,
                name: "Sneaker X",
                sku: "SNK-1",
                visible: true,
                available_sizes: [{ size: "42", quantity: 3, source: "file_column" }],
            },
        ],
        stock: [
            { product_id: "p-nutella", quantity: 6, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" },
            { product_id: "p-sneaker", quantity: 3, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" },
        ],
    };
    // Le nouveau push ne contient QUE le Nutella : le Sneaker a disparu (vendu).
    const csv = ["Code-barres;Désignation;Quantité;Prix", "3017620422003;Nutella 750g;5;4,50"].join("\n");

    const { admin, db } = makeStatefulAdmin(seed);
    let result: Awaited<ReturnType<typeof ingestStockSnapshot>>;

    it("PREUVE : 1 produit décrémenté à 0, 0 créé, le présent mis à jour", async () => {
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));
        result = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
        // eslint-disable-next-line no-console
        console.log("STOCK APRÈS RÉCONCILIATION:\n" + JSON.stringify(db.stock, null, 2));
        // eslint-disable-next-line no-console
        console.log("FEED_EVENTS:\n" + JSON.stringify(db.feed_events, null, 2));

        expect(result.products_created).toBe(0);
        expect(result.products_updated).toBe(1); // Nutella re-affirmé
        expect(result.stock_zeroed).toBe(1); // Sneaker absent → décrémenté
        expect(result.reconcile_skipped).toBe(false);
    });

    it("le PRÉSENT (Nutella) garde sa quantité du fichier (REPLACE), jamais touché par la réconciliation", () => {
        const nutella = db.stock.find((s) => s.product_id === "p-nutella")!;
        expect(nutella.quantity).toBe(5);
        expect(nutella.source).toBe("file_push");
    });

    it("l'ABSENT (Sneaker) passe à quantity=0, source='file_push', source_ts rafraîchi (le push décide l'épuisement)", () => {
        const sneaker = db.stock.find((s) => s.product_id === "p-sneaker")!;
        expect(sneaker.quantity).toBe(0);
        expect(sneaker.source).toBe("file_push"); // pas la source précédente qui mentirait
        expect(sneaker.source_ts).toMatch(ISO);
        // source_ts a bien été rafraîchi (≠ la valeur seed périmée).
        expect(sneaker.source_ts).not.toBe("2026-06-20T08:00:00.000Z");
    });

    it("un feed_events 'out_of_stock' est émis pour l'absent (canal de décrémentation traçable)", () => {
        const evt = db.feed_events.find((e) => e.product_id === "p-sneaker");
        expect(evt).toMatchObject({ merchant_id: M, product_id: "p-sneaker", event_type: "out_of_stock" });
    });

    it("HONNÊTETÉ D'AFFICHAGE : les tailles de l'absent sont vidées (plus de pointure fantôme « disponible »)", () => {
        const sneaker = db.products.find((p) => p.id === "p-sneaker")!;
        // Avant : [{size:"42",quantity:3}] → la fiche produit montrerait « 42 dispo ».
        // Après réconciliation : [] → cohérent avec stock 0.
        expect(sneaker.available_sizes).toEqual([]);
    });
});

describe("MAILLON 4 — GARDE-FOU : un fichier tronqué n'efface JAMAIS le magasin (zéro écrasement silencieux)", () => {
    it("push couvrant <50% d'un catalogue ≥10 → réconciliation ANNULÉE, stock intégralement préservé, erreur visible", async () => {
        // 12 produits en stock (≥ minCatalogForGuard=10). Le fichier (réseau coupé /
        // export partiel) ne ré-affirme que 2 d'entre eux → 2/12 = 17% < 50%.
        const products: Row[] = [];
        const stock: Row[] = [];
        for (let i = 0; i < 12; i++) {
            products.push({ id: `p${i}`, merchant_id: M, ean: `400000000000${i}`, name: `Produit ${i}`, sku: null, visible: true, available_sizes: [] });
            stock.push({ product_id: `p${i}`, quantity: 5, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" });
        }
        const { admin, db } = makeStatefulAdmin({ products, stock });

        // Fichier partiel : seulement p0 et p1 (par EAN).
        const csv = ["Code-barres;Désignation;Quantité;Prix", "4000000000000;Produit 0;5;1,00", "4000000000001;Produit 1;5;1,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
        // eslint-disable-next-line no-console
        console.log("GARDE-FOU result:\n" + JSON.stringify({ skipped: r.reconcile_skipped, zeroed: r.stock_zeroed, errors: r.errors }, null, 2));

        expect(r.reconcile_skipped).toBe(true);
        expect(r.stock_zeroed).toBe(0); // RIEN effacé
        expect(r.errors.some((e) => /partiel|annulée/i.test(e))).toBe(true);
        // Invariant dur : les 12 stocks restent à 5 (aucune décrémentation à l'aveugle).
        expect(db.stock.every((s) => (s.quantity as number) === 5)).toBe(true);
    });

    it("push SANS ligne exploitable (que des noms seuls, rejetés) + reconcile → annulé, stock préservé", async () => {
        const { admin, db } = makeStatefulAdmin({
            products: [{ id: "p-x", merchant_id: M, ean: "3017620422003", name: "Nutella", sku: null, visible: true, available_sizes: [] }],
            stock: [{ product_id: "p-x", quantity: 9, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" }],
        });
        // Fichier illisible côté identité : aucune colonne code-barres/référence → tout rejeté au triage.
        const csv = ["Désignation;Quantité;Prix", "Bougie sans code;3;6,00", "Savon sans code;2;4,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
        expect(r.reconcile_skipped).toBe(true);
        expect(r.stock_zeroed).toBe(0);
        expect(r.errors.some((e) => /aucune ligne exploitable/i.test(e))).toBe(true);
        // Le stock existant n'a PAS été vidé par un fichier qu'on n'a pas su lire.
        expect(db.stock.find((s) => s.product_id === "p-x")!.quantity).toBe(9);
    });
});

describe("MAILLON 4 — la RUPTURE déclarée dans le fichier (qty 0) passe par l'update, pas par la réconciliation", () => {
    it("produit présent au push avec quantité 0 → mis à jour à 0 (touched), PAS compté comme décrémenté", async () => {
        const { admin, db } = makeStatefulAdmin({
            products: [
                { id: "p-a", merchant_id: M, ean: "3017620422003", name: "Nutella", sku: null, visible: true, available_sizes: [] },
                { id: "p-b", merchant_id: M, ean: "0036000291452", name: "Coca", sku: null, visible: true, available_sizes: [] },
            ],
            stock: [
                { product_id: "p-a", quantity: 6, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" },
                { product_id: "p-b", quantity: 4, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" },
            ],
        });
        // Le fichier liste les DEUX, mais déclare le Nutella en rupture (0) ; le Coca absent.
        const csv = ["Code-barres;Désignation;Quantité;Prix", "3017620422003;Nutella;0;4,50"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
        // Nutella déclaré 0 = update (touched) ; Coca absent = réconciliation.
        expect(r.products_updated).toBe(1);
        expect(r.stock_zeroed).toBe(1); // seul le Coca (absent), pas le Nutella
        expect(db.stock.find((s) => s.product_id === "p-a")!.quantity).toBe(0); // rupture déclarée
        expect(db.stock.find((s) => s.product_id === "p-b")!.quantity).toBe(0); // décrémenté (absent)
        // Les deux finissent à 0 mais par des CHEMINS distincts — sans double comptage.
    });
});

import { describe, it, expect, vi } from "vitest";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";

// groupVariantsByEAN (post-pass) et l'enrichissement async ne sont pas l'objet ici.
vi.mock("@/lib/pos/sync-engine", () => ({ groupVariantsByEAN: vi.fn() }));
vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

/**
 * SCALE / VOLUME — anti-troncature `max-rows` PostgREST sur l'ingestion (priorities §1bis
 * item #4 : « réconciliation qui lit tout le catalogue », pilier 1 north-star « ne rien
 * oublier »). Un SELECT non borné est tronqué SILENCIEUSEMENT à 1000 lignes par PostgREST.
 *
 * Bug avant `fetchAllRows` (les 2 lectures de snapshot.ts non paginées) sur un catalogue
 * de 1500 produits :
 *  - index produits existants coupé à 1000 → les produits 1000..1499 vus comme « nouveaux »
 *    → DOUBLONS catalogue (aucune contrainte UNIQUE sur ean) ;
 *  - lecture du stock en cours coupée à 1000 → un produit VENDU au-delà du 1000ᵉ (absent du
 *    push) jamais remis à 0 → reste « en stock » = faux positif n°1.
 *
 * Ce test prouve les DEUX corrections en un seul push réaliste. Le faux client simule
 * fidèlement PostgREST en pagination KEYSET : `.limit(n)` est plafonné à 1000 (max-rows),
 * `.gt(colonne, curseur)` borne la page suivante par VALEUR (pas par offset → dérive-immune),
 * `.order(colonne)` fixe l'ordre de balayage. `fetchAllRows` récupère les 1500 lignes.
 */

const M = "merchant-scale";
const CATALOG = 1500; // > max-rows (1000)
const OMITTED = 1200; // produit en stock dont la ligne existante est AU-DELÀ du 1000ᵉ
const MAX_ROWS = 1000;

type Row = Record<string, unknown>;
type Store = { products: Row[]; stock: Row[]; feed_events: Row[]; enrichment_jobs: Row[] };

function makeStatefulAdmin() {
    const db: Store = {
        // 1500 produits existants (SKU-i), tous en stock (qty 5).
        products: Array.from({ length: CATALOG }, (_, i) => ({
            id: `p${i}`,
            merchant_id: M,
            ean: null,
            name: `Produit ${i}`,
            sku: `SKU-${i}`,
            visible: false,
            review_status: "pending",
        })),
        stock: Array.from({ length: CATALOG }, (_, i) => ({ product_id: `p${i}`, quantity: 5 })),
        feed_events: [],
        enrichment_jobs: [],
    };

    type ApplyState = {
        op: "select" | "insert" | "update" | "upsert" | "update_in";
        filters: Record<string, unknown>;
        payload: unknown;
        inCol: string | null;
        inVals: string[] | null;
        gtFilters: Array<{ col: string; val: unknown }>; // KEYSET : `.gt(col, curseur)` (+ quantity>0)
        orderCol: string | null; // colonne de balayage keyset
        limitN: number | null; // taille de page demandée
    };

    function apply(table: keyof Store, st: ApplyState): { data: unknown; error: null } {
        if (st.op === "insert") {
            const rows = Array.isArray(st.payload) ? st.payload : [st.payload];
            for (const r of rows) db[table].push({ ...(r as Row) });
            return { data: null, error: null };
        }
        if (st.op === "upsert") {
            // Flush batché (SCALE) : upsert d'un TABLEAU de lignes stock → itérer.
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
        // ── SELECT ──
        let rows: Row[];
        if (table === "products") {
            rows = db.products
                .filter((p) => p.merchant_id === st.filters.merchant_id)
                .map((p) => ({ id: p.id, ean: p.ean, name: p.name, sku: p.sku }));
        } else if (table === "stock") {
            const mid = st.filters["products.merchant_id"];
            rows = db.stock
                .filter(
                    (s) =>
                        (s.quantity as number) > 0 &&
                        db.products.some((p) => p.id === s.product_id && p.merchant_id === mid),
                )
                .map((s) => ({ product_id: s.product_id, quantity: s.quantity }));
        } else {
            rows = [];
        }
        // KEYSET : `.gt(col, curseur)` = borne basse EXCLUSIVE (dérive-immune), appliquée
        // par VALEUR sur la colonne d'ordre. (quantity>0 est déjà baked ci-dessus → ce
        // filtre-là est redondant, inoffensif.) Tri par `orderCol`, PUIS plafond max-rows
        // min(limit, 1000) — PostgREST tronque même une limite plus large.
        for (const g of st.gtFilters) {
            rows = rows.filter((r) => (r[g.col] as string | number) > (g.val as string | number));
        }
        if (st.orderCol) {
            const col = st.orderCol;
            rows = [...rows].sort((a, b) =>
                (a[col] as string) > (b[col] as string) ? 1 : (a[col] as string) < (b[col] as string) ? -1 : 0,
            );
        }
        const cap = Math.min(st.limitN ?? MAX_ROWS, MAX_ROWS);
        if (rows.length > cap) rows = rows.slice(0, cap);
        return { data: rows, error: null };
    }

    function from(table: keyof Store) {
        const st: ApplyState = {
            op: "select",
            filters: {},
            payload: null,
            inCol: null,
            inVals: null,
            gtFilters: [],
            orderCol: null,
            limitN: null,
        };
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = (col: string, val: unknown) => {
            st.filters[col] = val;
            return b;
        };
        // `.gt` porte À LA FOIS le filtre métier `quantity>0` ET le curseur keyset
        // `.gt(id|product_id, curseur)` de fetchAllRows → on les enregistre tous.
        b.gt = (col: string, val: unknown) => {
            st.gtFilters.push({ col, val });
            return b;
        };
        b.order = (col: string) => {
            st.orderCol = col;
            return b;
        };
        b.limit = (n: number) => {
            st.limitN = n;
            return b;
        };
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

// Push réaliste : 1499 des 1500 produits (on omet SKU-1200, en stock, ligne au-delà du
// 1000ᵉ) → couverture 99,9% > 50% → la réconciliation s'exécute (pas de garde partiel).
function buildPush(): string {
    const lines = ["Code-barres;Désignation;Référence;Quantité;Prix"];
    for (let i = 0; i < CATALOG; i++) {
        if (i === OMITTED) continue;
        lines.push(`;Produit ${i};SKU-${i};5;9,99`);
    }
    return lines.join("\n");
}

describe("MAILLON SCALE — ingestion sur catalogue > max-rows (1500 produits)", () => {
    const { admin, db } = makeStatefulAdmin();
    let result: Awaited<ReturnType<typeof ingestStockSnapshot>>;

    it("setup : push 1499/1500 produits par SKU (omis : SKU-1200)", async () => {
        const { items, coverage } = parseStockFile(Buffer.from(buildPush(), "utf-8"));
        // 1499 lignes exploitables (SKU), 0 rejet.
        expect(items.length).toBe(CATALOG - 1);
        result = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
    });

    it("AUCUN doublon : index produits lu AU-DELÀ de 1000 → les 1499 matchent (0 créé)", () => {
        expect(result.products_created).toBe(0); // sans pagination : ~500 doublons créés
        expect(result.products_updated).toBe(CATALOG - 1);
        expect(db.products).toHaveLength(CATALOG); // toujours 1500, pas 1500+doublons
    });

    it("réconciliation lue AU-DELÀ de 1000 : le produit vendu #1200 (omis) est remis à 0", () => {
        // Sans pagination de la lecture stock, #1200 (ligne >1000ᵉ) serait absent du set
        // « en stock » → jamais candidat au passage à 0 → resterait « en stock » (faux positif).
        const stock1200 = db.stock.find((s) => s.product_id === `p${OMITTED}`)!;
        expect(stock1200.quantity).toBe(0);
        expect(result.stock_zeroed).toBe(1);
        expect(result.reconcile_skipped).toBe(false);
    });

    it("les produits poussés gardent leur quantité (réconciliation n'épuise QUE l'absent)", () => {
        const stock500 = db.stock.find((s) => s.product_id === "p500")!;
        const stock1400 = db.stock.find((s) => s.product_id === "p1400")!; // au-delà de 1000
        expect(stock500.quantity).toBe(5);
        expect(stock1400.quantity).toBe(5);
    });
});

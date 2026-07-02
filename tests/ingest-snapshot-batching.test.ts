import { describe, it, expect, vi } from "vitest";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";

// Le post-pass groupVariantsByEAN et l'enrichissement async ont leurs propres tests.
vi.mock("@/lib/pos/sync-engine", () => ({ groupVariantsByEAN: vi.fn() }));
vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));
import { captureError } from "@/lib/error";

/**
 * SCALE / VOLUME — le premier push d'onboarding pilote (boutique multimarque type
 * Deerskin = MILLIERS de SKU NEUFS) ne doit PAS faire O(N) aller-retours réseau
 * SÉQUENTIELS (products.insert + stock.upsert + available_sizes.update +
 * feed_events.insert par produit) : sur des milliers d'items, le budget temps Vercel
 * est dépassé → fonction TUÉE en plein vol → ingestion tronquée SILENCIEUSEMENT (perte
 * n°1, même classe que le cron google-feed). `ingestStockSnapshot` écrit désormais par
 * LOTS de 500 (products → stock → feed_events → enrichment).
 *
 * Ce test PROUVE la borne : sur N créations, le nombre d'appels d'écriture est
 * ceil(N/500), PAS N. Non-vacant : l'ancien code par-produit appelait insert/upsert
 * N fois (ici 1200) — les assertions `<= 3` échoueraient. Et l'invariant north-star
 * « 0 doublon + rien perdu » est re-vérifié à l'échelle.
 */

type Row = Record<string, unknown>;
type Store = { products: Row[]; stock: Row[]; feed_events: Row[]; enrichment_jobs: Row[] };

type Calls = {
    products_insert: number;
    products_update: number;
    products_upsert: number;
    stock_upsert: number;
    feed_events_insert: number;
    enrichment_jobs_insert: number;
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

const MAX_ROWS = 1000;

/**
 * Faux client STATEFUL qui COMPTE les aller-retours d'écriture par table+op, simule la
 * troncature max-rows PostgREST sur les lectures non paginées, et peut faire ÉCHOUER un
 * INSERT de LOT contenant une ligne « POISON » (simule une collision de slug unique) tout
 * en laissant passer les autres lignes en repli mono-ligne — pour prouver l'isolation d'échec.
 */
function makeCountingAdmin(seed: Partial<Store> = {}, opts: { poison?: string; failUpdateFor?: string; failZero?: boolean } = {}) {
    const db: Store = {
        products: (seed.products ?? []).map((r) => ({ ...r })),
        stock: (seed.stock ?? []).map((r) => ({ ...r })),
        feed_events: [],
        enrichment_jobs: [],
    };
    const calls: Calls = {
        products_insert: 0,
        products_update: 0,
        products_upsert: 0,
        stock_upsert: 0,
        feed_events_insert: 0,
        enrichment_jobs_insert: 0,
    };

    function apply(table: keyof Store, st: ApplyState): { data: unknown; error: { message: string } | null } {
        if (st.op === "insert") {
            const rows = Array.isArray(st.payload) ? (st.payload as Row[]) : [st.payload as Row];
            if (table === "products") calls.products_insert++;
            else if (table === "feed_events") calls.feed_events_insert++;
            else if (table === "enrichment_jobs") calls.enrichment_jobs_insert++;
            // Simule une contrainte unique (slug) : un LOT contenant la ligne poison
            // échoue EN BLOC ; le repli mono-ligne fera échouer UNIQUEMENT le poison.
            if (opts.poison && table === "products" && rows.some((r) => r.name === opts.poison)) {
                if (rows.length > 1 || rows[0].name === opts.poison) {
                    return { data: null, error: { message: `duplicate slug (${opts.poison})` } };
                }
            }
            for (const r of rows) db[table].push({ ...r });
            return { data: null, error: null };
        }
        if (st.op === "upsert") {
            const rows = Array.isArray(st.payload) ? (st.payload as Row[]) : [st.payload as Row];
            if (table === "products") {
                calls.products_upsert++;
                // Simule un échec de contrainte : un LOT contenant le produit ciblé
                // échoue EN BLOC → déclenche le repli mono-ligne (comme les créations).
                if (opts.failUpdateFor && rows.some((r) => db.products.find((p) => p.id === r.id)?.name === opts.failUpdateFor)) {
                    return { data: null, error: { message: `upsert denied (${opts.failUpdateFor})` } };
                }
                // FIDÉLITÉ PostgREST upsert (defaultToNull) : l'UNION des colonnes du
                // LOT est écrite ; une colonne absente d'une ligne est mise à NULL. C'est
                // EXACTEMENT le piège que le groupage par forme (côté prod) doit éviter :
                // si ce faux client null-fille, un test qui mélange des formes échouera.
                const cols = new Set<string>();
                for (const r of rows) for (const k of Object.keys(r)) cols.add(k);
                for (const r of rows) {
                    const idx = db.products.findIndex((x) => x.id === r.id);
                    if (idx < 0) continue; // ligne absente → INSERT partiel (hors scope des tests normaux)
                    const merged: Row = { ...db.products[idx] };
                    for (const c of cols) merged[c] = c in r ? r[c] : null;
                    db.products[idx] = merged;
                }
                return { data: null, error: null };
            }
            if (table === "stock") calls.stock_upsert++;
            for (const r of rows) {
                const idx = db[table].findIndex((x) => x.product_id === r.product_id);
                if (idx >= 0) db[table][idx] = { ...db[table][idx], ...r };
                else db[table].push({ ...r });
            }
            return { data: null, error: null };
        }
        if (st.op === "update") {
            if (table === "products") calls.products_update++;
            // Simule un échec de MAJ métadonnée (prix/tailles) pour un produit nommé.
            if (opts.failUpdateFor && table === "products") {
                const target = db.products.find((p) => p.id === st.filters.id);
                if (target && target.name === opts.failUpdateFor) {
                    return { data: null, error: { message: `update denied (${opts.failUpdateFor})` } };
                }
            }
            for (const row of db[table]) if (row.id === st.filters.id) Object.assign(row, st.payload);
            return { data: null, error: null };
        }
        if (st.op === "update_in") {
            // Simule un échec du write le plus critique de la réconciliation (stock=0).
            if (opts.failZero && table === "stock" && st.inCol === "product_id") {
                return { data: null, error: { message: "zero batch denied" } };
            }
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
                .filter((s) => (s.quantity as number) > 0 && db.products.some((p) => p.id === s.product_id && p.merchant_id === mid))
                .map((s) => ({ product_id: s.product_id, quantity: s.quantity }));
        } else {
            rows = [];
        }
        // KEYSET : `.gt(col, curseur)` = borne basse EXCLUSIVE par valeur (dérive-immune).
        // (quantity>0 déjà baked → redondant, inoffensif.) Tri par `orderCol`, cap min(limit, 1000).
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
        // `.gt` porte quantity>0 (SELECT stock) ET le curseur keyset `.gt(id|product_id, curseur)`.
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

    return { admin: { from } as never, db, calls };
}

const M = "merchant-batch";

function buildNewPush(n: number): string {
    const lines = ["Code-barres;Désignation;Référence;Quantité;Prix"];
    for (let i = 0; i < n; i++) lines.push(`;Produit ${i};SKU-${i};${(i % 9) + 1};9,99`);
    return lines.join("\n");
}

describe("MAILLON SCALE — premier push de 1200 produits NEUFS écrit par LOTS (borne O(N/500))", () => {
    const N = 1200;
    const { admin, db, calls } = makeCountingAdmin();
    let result: Awaited<ReturnType<typeof ingestStockSnapshot>>;

    it("setup : ingère 1200 créations", async () => {
        const { items, coverage } = parseStockFile(Buffer.from(buildNewPush(N), "utf-8"));
        expect(items.length).toBe(N);
        result = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
    });

    it("les 1200 produits sont créés, 0 doublon, chacun avec sa ligne stock", () => {
        expect(result.products_created).toBe(N);
        expect(result.products_updated).toBe(0);
        expect(db.products).toHaveLength(N);
        expect(db.stock).toHaveLength(N);
        expect(result.stock_replaced).toBe(N);
    });

    it("BORNE SCALE : écritures groupées en ceil(1200/500)=3 lots, JAMAIS 1200 appels", () => {
        // Non-vacant : l'ancien code par-produit ferait 1200 inserts + 1200 upserts.
        expect(calls.products_insert).toBe(3);
        expect(calls.stock_upsert).toBe(3);
        expect(calls.feed_events_insert).toBe(3);
        expect(calls.enrichment_jobs_insert).toBe(3);
        // Aucun produit NEUF ne déclenche d'UPDATE par-produit (available_sizes plié
        // dans l'insert, pas de re-write séparé) ni d'upsert de MAJ (0 pré-existant).
        expect(calls.products_update).toBe(0);
        expect(calls.products_upsert).toBe(0);
    });

    it("les quantités sont exactes (aucune perte à l'échelle) : produit #777 → qty (777%9)+1", () => {
        const p777 = db.products.find((p) => p.sku === "SKU-777")!;
        expect(p777).toBeDefined();
        const s777 = db.stock.find((s) => s.product_id === p777.id)!;
        expect(s777.quantity).toBe((777 % 9) + 1);
        expect(s777.source).toBe("file_push");
    });

    it("tous les nouveaux produits sont enfilés pour enrichissement (rien d'oublié en aval)", () => {
        expect(db.enrichment_jobs).toHaveLength(N);
    });
});

describe("MAILLON SCALE — re-push : 1200 updates par lots, 0 doublon (idempotence à l'échelle)", () => {
    it("le 2e push matche tout (SKU) → 0 créé, 1200 mis à jour, stock re-écrit en 3 lots", async () => {
        const N = 1200;
        const { admin, db, calls } = makeCountingAdmin();
        const { items, coverage } = parseStockFile(Buffer.from(buildNewPush(N), "utf-8"));

        await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
        // Reset des compteurs : on n'observe QUE le 2e push.
        calls.products_insert = 0;
        calls.stock_upsert = 0;
        calls.products_update = 0;

        const second = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
        expect(second.products_created).toBe(0); // invariant 0 doublon
        expect(second.products_updated).toBe(N);
        expect(db.products).toHaveLength(N);
        // Stock ré-écrit par lots (borne), pas 1200 upserts.
        expect(calls.stock_upsert).toBe(3);
        expect(calls.products_insert).toBe(0);
        // BORNE SCALE des MAJ métadonnée : les 1200 updates (tous de forme « price »)
        // partent en ceil(1200/500)=3 upserts groupés, JAMAIS 1200 `.update()` sériés.
        // Non-vacant : l'ancien code par-produit ferait 1200 appels `.update()`.
        expect(calls.products_upsert).toBe(3);
        expect(calls.products_update).toBe(0);
    });
});

describe("MAILLON SCALE — groupage par forme : un batch d'update ne NULLE jamais une colonne absente", () => {
    it("re-push mixte {prix seul} + {tailles seules} → prix inchangé JAMAIS écrasé par null", async () => {
        // Deux produits pré-existants (petit catalogue < 10 → garde couverture off).
        const seed: Partial<Store> = {
            products: [
                { id: "p-price", merchant_id: M, ean: "3017620422003", name: "Prix Only", sku: null, visible: true, price: 5, available_sizes: [] },
                { id: "p-size", merchant_id: M, ean: "0036000291452", name: "Taille Only", sku: null, visible: true, price: 8, available_sizes: [] },
            ],
            stock: [
                { product_id: "p-price", quantity: 5, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" },
                { product_id: "p-size", quantity: 5, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" },
            ],
        };
        const { admin, db, calls } = makeCountingAdmin(seed);
        // p-price : nouveau PRIX, pas de taille → forme « price ».
        // p-size  : une TAILLE, colonne prix VIDE → forme « available_sizes » (price=null).
        const csv = [
            "Code-barres;Désignation;Taille;Quantité;Prix",
            "3017620422003;Prix Only;;4;9,50",
            "0036000291452;Taille Only;42;3;",
        ].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });
        expect(r.products_created).toBe(0);
        expect(r.products_updated).toBe(2);

        // Les deux formes sont dans des GROUPES SÉPARÉS → 2 upserts, 0 repli mono-ligne.
        expect(calls.products_upsert).toBe(2);
        expect(calls.products_update).toBe(0);

        const pPrice = db.products.find((p) => p.id === "p-price")!;
        const pSize = db.products.find((p) => p.id === "p-size")!;
        // p-price : prix mis à jour, tailles NON nullées (available_sizes hors de son groupe).
        expect(pPrice.price).toBe(9.5);
        expect(pPrice.available_sizes).toEqual([]);
        // p-size : PIÈGE — son fichier n'a PAS de prix. Sans groupage, un upsert mixte
        // aurait mis `price:null` (union des colonnes) → prix 8 ÉCRASÉ. Avec groupage,
        // son lot ne porte que `available_sizes` → prix 8 PRÉSERVÉ.
        expect(pSize.price).toBe(8);
        expect((pSize.available_sizes as { size: string }[]).map((s) => s.size)).toEqual(["42"]);
    });
});

describe("MAILLON SCALE — un LOT d'insert en échec retombe en repli MONO-LIGNE (isolation d'échec)", () => {
    it("une ligne POISON (collision slug) fait échouer son lot → seule elle est perdue, les autres passent", async () => {
        vi.mocked(captureError).mockClear();
        // 600 produits : 2 lots (500 + 100). Le poison est dans le 1er lot.
        const N = 600;
        const { admin, db } = makeCountingAdmin({}, { poison: "Produit 3" });
        const { items, coverage } = parseStockFile(Buffer.from(buildNewPush(N), "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage });

        // 599 créés (le poison isolé au repli), 1 signalé, jamais 500 perdus en bloc.
        expect(r.products_created).toBe(N - 1);
        expect(db.products).toHaveLength(N - 1);
        expect(db.products.find((p) => p.name === "Produit 3")).toBeUndefined();
        // Un produit SAIN du même lot que le poison est bien présent.
        expect(db.products.find((p) => p.name === "Produit 4")).toBeDefined();
        // L'échec du poison est SIGNALÉ (errors + Sentry), jamais avalé.
        expect(r.errors.some((e) => /Produit 3/.test(e))).toBe(true);
        expect(captureError).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("duplicate slug") }),
            expect.objectContaining({ phase: "create-product-insert", merchantId: M }),
        );
        // Le stock du poison n'est PAS écrit (produit inexistant → exclu du flush stock).
        expect(db.stock).toHaveLength(N - 1);
        expect(r.stock_replaced).toBe(N - 1);
    });
});

describe("MAILLON SCALE — échec de MAJ métadonnée ne doit JAMAIS faire zéroïser le produit (F2 revue)", () => {
    it("update prix échoué sur un produit RÉ-AFFIRMÉ → stock quand même écrit, PAS zéroïsé, erreur+Sentry", async () => {
        vi.mocked(captureError).mockClear();
        // 2 produits pré-existants (petit catalogue < 10 → garde couverture off). Le
        // fichier ré-affirme les DEUX, mais la MAJ prix de « Fail Update » échoue.
        const seed: Partial<Store> = {
            products: [
                { id: "p-fail", merchant_id: M, ean: "3017620422003", name: "Fail Update", sku: null, visible: true, available_sizes: [] },
                { id: "p-ok", merchant_id: M, ean: "0036000291452", name: "Reste OK", sku: null, visible: true, available_sizes: [] },
            ],
            stock: [
                { product_id: "p-fail", quantity: 5, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" },
                { product_id: "p-ok", quantity: 5, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" },
            ],
        };
        const { admin, db } = makeCountingAdmin(seed, { failUpdateFor: "Fail Update" });
        const csv = ["Code-barres;Désignation;Quantité;Prix", "3017620422003;Fail Update;8;7,00", "0036000291452;Reste OK;6;1,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });

        // AVANT le fix : p-fail exclu de `touched` → réconciliation le passe à 0 (faux
        // « rupture », perte n°1). APRÈS : touché → jamais zéroïsé, et son STOCK est
        // quand même remplacé par la valeur du fichier (donnée critique préservée).
        expect(r.reconcile_skipped).toBe(false);
        expect(r.stock_zeroed).toBe(0);
        expect(db.stock.find((s) => s.product_id === "p-fail")!.quantity).toBe(8); // écrit, pas 0
        expect(db.stock.find((s) => s.product_id === "p-ok")!.quantity).toBe(6);
        // L'échec est SIGNALÉ (statut partial) + Sentry (diagnostic DB), jamais avalé.
        expect(r.errors.some((e) => /Fail Update/.test(e))).toBe(true);
        expect(captureError).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("update denied") }),
            expect.objectContaining({ phase: "update-product", merchantId: M }),
        );
    });
});

describe("MAILLON SCALE — échec du write stock=0 (réconciliation) : SIGNALÉ + Sentry, jamais avalé (F1 revue SF)", () => {
    it("un lot stock=0 en échec → produit PAS zéroïsé (préservé), errors + captureError phase reconcile-stock-zero", async () => {
        vi.mocked(captureError).mockClear();
        // 1 produit pré-existant en stock, ABSENT du push → candidat au passage à 0.
        const seed: Partial<Store> = {
            products: [{ id: "p-old", merchant_id: M, ean: "3017620422003", name: "Ancien", sku: null, visible: true, available_sizes: [] }],
            stock: [{ product_id: "p-old", quantity: 5, source: "file_push", source_ts: "2026-06-20T08:00:00.000Z" }],
        };
        const { admin, db } = makeCountingAdmin(seed, { failZero: true });
        // Le push ne contient QUE p-new → p-old doit être réconcilié à 0, mais le write échoue.
        const csv = ["Code-barres;Désignation;Quantité;Prix", "0036000291452;Nouveau;3;1,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });

        // Write en échec → produit NON zéroïsé (sa qté réelle est préservée, pas un faux 0).
        expect(db.stock.find((s) => s.product_id === "p-old")!.quantity).toBe(5);
        expect(r.stock_zeroed).toBe(0);
        // SIGNALÉ (statut partial) ET envoyé à Sentry (plus d'angle mort) — jamais avalé.
        expect(r.errors.some((e) => /Réconciliation stock=0/.test(e))).toBe(true);
        expect(captureError).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("zero batch denied") }),
            expect.objectContaining({ phase: "reconcile-stock-zero", merchantId: M }),
        );
    });
});

describe("MAILLON SCALE — dédoublonnage intra-push préservé à l'échelle (identité réutilisée)", () => {
    it("300 produits + 1 ligne réutilisant SKU-0 (libellé différent) → 300 produits, jamais 301", async () => {
        const { admin, db } = makeCountingAdmin();
        const lines = ["Code-barres;Désignation;Référence;Quantité;Prix"];
        for (let i = 0; i < 300; i++) lines.push(`;Produit ${i};SKU-${i};5;9,99`);
        // Ligne 301 : réutilise SKU-0 (créé plus tôt dans CE push) avec un libellé
        // différent → doit MATCHER le produit pending, PAS créer un 301e (dédoublonnage
        // intra-push : le match tape sur la ligne d'insert en attente, pas un doublon).
        lines.push(`;Produit ZERO alias;SKU-0;7;9,99`);
        const { items, coverage } = parseStockFile(Buffer.from(lines.join("\n"), "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage });
        expect(r.products_created).toBe(300);
        expect(r.products_updated).toBe(1); // l'alias compte comme une mise à jour du pending
        expect(db.products).toHaveLength(300);
        // Le stock du produit SKU-0 reflète la DERNIÈRE valeur (REPLACE, dédup product_id).
        const p0 = db.products.find((p) => p.sku === "SKU-0")!;
        expect(db.stock.find((s) => s.product_id === p0.id)!.quantity).toBe(7);
    });
});

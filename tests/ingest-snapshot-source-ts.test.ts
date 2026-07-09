import { describe, it, expect, vi, afterEach } from "vitest";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";
import { sanitizeSourceTs } from "@/lib/ingest/source-ts";

// Le post-pass groupVariantsByEAN et l'enrichissement async ont leurs propres tests.
vi.mock("@/lib/pos/sync-engine", () => ({ groupVariantsByEAN: vi.fn() }));
vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));
import { captureError } from "@/lib/error";

/**
 * AUDIT 2026-07-08, M4 CRITIQUE (feuille de route item #3) — le flux FILE_PUSH
 * contournait la garde temporelle 104 avec `source_ts = heure du push` : un export
 * nocturne (généré 02:00) uploadé à 09:00 (a) écrasait une vente webhook de 08:00
 * (REPLACE et réconciliation → faux « en stock » / faux « épuisé »), (b) mentait sur
 * la fraîcheur M5 (« vu à l'instant » pour une observation de 7 h).
 *
 * Prouvé ici :
 *  1. `sanitizeSourceTs` (pur) : ISO/epoch-ms acceptés, futur CLAMPÉ, aberrant → null.
 *  2. `opts.sourceTs` → `stock.source_ts` porte la VRAIE heure d'observation.
 *  3. Réconciliation GARDÉE (`.lte` porté par l'UPDATE = atomique) : un produit dont la
 *     vérité courante est plus fraîche que l'export n'est JAMAIS passé à 0, et les
 *     effets dérivés (out_of_stock, vidage tailles) ne visent que les lignes RÉELLEMENT
 *     à 0. Compteurs honnêtes (`stock_zeroed`, `stock_stale_skipped`).
 *  4. GATED `FILE_PUSH_ATOMIC_STOCK=1` (migration 112) : REPLACE via la RPC batch
 *     `ingest_stock_batch` (garde 104 en set, borne ceil(N/500) préservée), rejets
 *     stale comptés ; RPC en échec → repli upsert SIGNALÉ (jamais un push perdu).
 *  5. Défaut (ni sourceTs ni flag) : comportement historique intact.
 *
 * Non-vacance : sans le fix, (2) écrit nowIso → les assertions d'égalité source_ts
 * échouent ; (3) zéroe le produit frais → `quantity=0` au lieu de 4 ; (4) upsert
 * direct → le produit frais est écrasé.
 */

type Row = Record<string, unknown>;
type Store = { products: Row[]; stock: Row[]; feed_events: Row[]; enrichment_jobs: Row[] };

type ApplyState = {
    op: "select" | "insert" | "update" | "upsert" | "update_in";
    filters: Record<string, unknown>;
    payload: unknown;
    inCol: string | null;
    inVals: string[] | null;
    gtFilters: Array<{ col: string; val: unknown }>;
    /** `.lte(col, val)` — la garde temporelle de la réconciliation. */
    lteFilters: Array<{ col: string; val: string }>;
    orderCol: string | null;
    limitN: number | null;
    /** `.select()` APRÈS update → PostgREST renvoie les lignes réellement modifiées. */
    wantRows: boolean;
};

/**
 * Faux client STATEFUL : stock avec `source_ts`, `.lte` honoré sur update_in,
 * `.select()` post-update renvoyant les lignes modifiées, et `rpc("ingest_stock_batch")`
 * simulant la migration 112 (garde `source_ts` entrant >= existant, retour
 * {product_id, written} par ligne). `failRpc` simule « flag ON sans migration ».
 */
function makeAdmin(seed: Partial<Store> = {}, opts: { failRpc?: boolean } = {}) {
    const db: Store = {
        products: (seed.products ?? []).map((r) => ({ ...r })),
        stock: (seed.stock ?? []).map((r) => ({ ...r })),
        feed_events: [],
        enrichment_jobs: [],
    };
    const calls = { stock_upsert: 0, rpc_batch: 0, zero_lte_used: 0 };

    function apply(table: keyof Store, st: ApplyState): { data: unknown; error: { message: string } | null } {
        if (st.op === "insert") {
            const rows = Array.isArray(st.payload) ? (st.payload as Row[]) : [st.payload as Row];
            for (const r of rows) db[table].push({ ...r });
            return { data: null, error: null };
        }
        if (st.op === "upsert") {
            const rows = Array.isArray(st.payload) ? (st.payload as Row[]) : [st.payload as Row];
            if (table === "stock") calls.stock_upsert++;
            const key = table === "stock" ? "product_id" : "id";
            for (const r of rows) {
                const idx = db[table].findIndex((x) => x[key] === r[key]);
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
            if (st.lteFilters.length > 0) calls.zero_lte_used++;
            const touchedRows: Row[] = [];
            for (const row of db[table]) {
                if (!st.inVals!.includes(row[st.inCol!] as string)) continue;
                // Garde temporelle : `.lte("source_ts", ts)` filtre sur la ligne EXISTANTE.
                const passes = st.lteFilters.every((f) => (row[f.col] as string) <= f.val);
                if (!passes) continue;
                Object.assign(row, st.payload);
                touchedRows.push(row);
            }
            return {
                data: st.wantRows ? touchedRows.map((r) => ({ [st.inCol!]: r[st.inCol!] })) : null,
                error: null,
            };
        }
        // SELECT
        let rows: Row[];
        if (table === "products") {
            rows = db.products
                .filter((p) => p.merchant_id === st.filters.merchant_id)
                .map((p) => ({ id: p.id, ean: p.ean, name: p.name, sku: p.sku }));
        } else if (table === "stock") {
            const mid = st.filters["products.merchant_id"];
            rows = db.stock
                .filter((s) => (s.quantity as number) > 0 && db.products.some((p) => p.id === s.product_id && p.merchant_id === mid))
                .map((s) => ({ product_id: s.product_id, quantity: s.quantity, source_ts: s.source_ts }));
        } else {
            rows = [];
        }
        for (const g of st.gtFilters) rows = rows.filter((r) => (r[g.col] as string | number) > (g.val as string | number));
        if (st.orderCol) {
            const col = st.orderCol;
            rows = [...rows].sort((a, b) => ((a[col] as string) > (b[col] as string) ? 1 : (a[col] as string) < (b[col] as string) ? -1 : 0));
        }
        if (st.limitN != null && rows.length > st.limitN) rows = rows.slice(0, st.limitN);
        return { data: rows, error: null };
    }

    function from(table: keyof Store) {
        const st: ApplyState = { op: "select", filters: {}, payload: null, inCol: null, inVals: null, gtFilters: [], lteFilters: [], orderCol: null, limitN: null, wantRows: false };
        const b: Record<string, unknown> = {};
        b.select = () => {
            if (st.op !== "select") st.wantRows = true;
            return b;
        };
        b.eq = (col: string, val: unknown) => ((st.filters[col] = val), b);
        b.gt = (col: string, val: unknown) => (st.gtFilters.push({ col, val }), b);
        b.lte = (col: string, val: string) => (st.lteFilters.push({ col, val }), b);
        b.order = (col: string) => ((st.orderCol = col), b);
        b.limit = (n: number) => ((st.limitN = n), b);
        b.insert = (payload: unknown) => ((st.op = "insert"), (st.payload = payload), b);
        b.update = (payload: unknown) => {
            if (st.op !== "update_in") st.op = "update";
            st.payload = payload;
            return b;
        };
        b.upsert = (payload: unknown) => ((st.op = "upsert"), (st.payload = payload), b);
        b.in = (col: string, vals: string[]) => ((st.op = "update_in"), (st.inCol = col), (st.inVals = vals), b);
        b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(apply(table, st)).then(resolve, reject);
        return b;
    }

    // RPC ingest_stock_batch (migration 112) : garde 104 EN SET + retour par ligne.
    function rpc(name: string, args: { p_rows: Row[] }) {
        if (name !== "ingest_stock_batch") return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
        calls.rpc_batch++;
        if (opts.failRpc) return Promise.resolve({ data: null, error: { message: "function ingest_stock_batch does not exist" } });
        const out: Array<{ product_id: string; written: boolean }> = [];
        for (const r of args.p_rows) {
            const pid = r.product_id as string;
            const idx = db.stock.findIndex((s) => s.product_id === pid);
            if (idx < 0) {
                db.stock.push({ product_id: pid, quantity: r.quantity, source: r.source, source_ts: r.source_ts });
                out.push({ product_id: pid, written: true });
                continue;
            }
            const existing = db.stock[idx];
            if ((r.source_ts as string) >= (existing.source_ts as string)) {
                db.stock[idx] = { ...existing, ...r };
                out.push({ product_id: pid, written: true });
            } else {
                out.push({ product_id: pid, written: false });
            }
        }
        return Promise.resolve({ data: out, error: null });
    }

    return { admin: { from, rpc } as never, db, calls };
}

const M = "merchant-source-ts";
const EXPORT_TS = "2026-07-09T02:00:00.000Z"; // export nocturne (02:00)
const WEBHOOK_TS = "2026-07-09T08:00:00.000Z"; // vente webhook POSTÉRIEURE (08:00)
const OLD_TS = "2026-07-01T10:00:00.000Z"; // vérité ancienne (poussée par un vieux push)

afterEach(() => {
    delete process.env.FILE_PUSH_ATOMIC_STOCK;
    vi.mocked(captureError).mockClear();
});

describe("sanitizeSourceTs (pur) — la vérité source déclarée est sanitisée, jamais crue sur parole", () => {
    const NOW = Date.parse("2026-07-09T09:00:00.000Z");

    it("accepte ISO 8601 et epoch millisecondes (string ou number)", () => {
        expect(sanitizeSourceTs("2026-07-09T02:00:00.000Z", NOW)).toBe(EXPORT_TS);
        expect(sanitizeSourceTs(String(Date.parse(EXPORT_TS)), NOW)).toBe(EXPORT_TS);
        expect(sanitizeSourceTs(Date.parse(EXPORT_TS), NOW)).toBe(EXPORT_TS);
    });

    it("CLAMPE le futur au présent : une horloge en avance ne fabrique jamais une vérité imbattable", () => {
        expect(sanitizeSourceTs("2026-07-09T23:59:00.000Z", NOW)).toBe(new Date(NOW).toISOString());
    });

    it("rejette l'aberrant (epoch 0, avant 2000, garbage, vide, null) → null (repli heure du push)", () => {
        expect(sanitizeSourceTs("0", NOW)).toBeNull();
        expect(sanitizeSourceTs("1999-12-31T23:00:00Z", NOW)).toBeNull();
        expect(sanitizeSourceTs("pas-une-date", NOW)).toBeNull();
        expect(sanitizeSourceTs("", NOW)).toBeNull();
        expect(sanitizeSourceTs(null, NOW)).toBeNull();
        expect(sanitizeSourceTs(undefined, NOW)).toBeNull();
        expect(sanitizeSourceTs({ hack: 1 }, NOW)).toBeNull();
    });
});

describe("M4 — source_ts porte la VRAIE heure d'observation (plus jamais l'heure du push)", () => {
    it("push avec sourceTs=02:00 → toutes les lignes stock (créées ET mises à jour) portent 02:00", async () => {
        const seed: Partial<Store> = {
            products: [{ id: "p-exist", merchant_id: M, ean: "3017620422003", name: "Existant", sku: null, available_sizes: [] }],
            stock: [{ product_id: "p-exist", quantity: 2, source: "file_push", source_ts: OLD_TS }],
        };
        const { admin, db } = makeAdmin(seed);
        const csv = ["Code-barres;Désignation;Quantité;Prix", "3017620422003;Existant;5;2,00", "0036000291452;Nouveau;3;1,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage, sourceTs: EXPORT_TS });

        expect(r.errors).toEqual([]);
        // Non-vacant : avant le fix, source_ts = heure du push (now) → ces égalités échouent.
        const sExist = db.stock.find((s) => s.product_id === "p-exist")!;
        expect(sExist.source_ts).toBe(EXPORT_TS);
        expect(sExist.quantity).toBe(5);
        const pNew = db.products.find((p) => p.ean === "0036000291452")!;
        expect(db.stock.find((s) => s.product_id === pNew.id)!.source_ts).toBe(EXPORT_TS);
        // La fraîcheur d'écriture DB (updated_at) reste distincte de la vérité source.
        expect(sExist.updated_at).not.toBe(EXPORT_TS);
    });

    it("sourceTs fourni mais INUTILISABLE → SIGNALÉ (Sentry) puis repli heure du push, ingestion intacte", async () => {
        const { admin, db } = makeAdmin();
        const csv = ["Code-barres;Désignation;Quantité;Prix", "3017620422003;Produit;5;2,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage, sourceTs: "garbage-ts" });

        expect(r.products_created).toBe(1);
        expect(db.stock).toHaveLength(1);
        // La garde temporelle resterait inerte EN SILENCE sans ce signal.
        expect(captureError).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("sourceTs fourni mais inutilisable") }),
            expect.objectContaining({ phase: "source-ts-invalid", merchantId: M }),
        );
    });
});

describe("M4 CRITIQUE — la réconciliation ne passe JAMAIS à 0 une vérité plus fraîche que l'export", () => {
    it("produit restocké par webhook (08:00) absent d'un export de 02:00 → PROTÉGÉ ; vérité ancienne → zéroée", async () => {
        const seed: Partial<Store> = {
            products: [
                { id: "p-fresh", merchant_id: M, ean: "3017620422003", name: "Restocké Webhook", sku: null, available_sizes: [{ size: "42", quantity: 4 }] },
                { id: "p-stale", merchant_id: M, ean: "0036000291452", name: "Vendu Depuis Longtemps", sku: null, available_sizes: [{ size: "43", quantity: 6 }] },
            ],
            stock: [
                { product_id: "p-fresh", quantity: 4, source: "webhook", source_ts: WEBHOOK_TS },
                { product_id: "p-stale", quantity: 6, source: "file_push", source_ts: OLD_TS },
            ],
        };
        const { admin, db, calls } = makeAdmin(seed);
        // L'export de 02:00 ne contient NI p-fresh NI p-stale (tous deux candidats au 0).
        const csv = ["Code-barres;Désignation;Quantité;Prix", "4006381333931;Autre Produit;9;3,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage, sourceTs: EXPORT_TS });

        // Non-vacant : avant le fix, p-fresh passait à 0 (faux « épuisé » sur un produit
        // réellement en rayon — LE scénario de l'audit).
        const fresh = db.stock.find((s) => s.product_id === "p-fresh")!;
        expect(fresh.quantity).toBe(4);
        expect(fresh.source_ts).toBe(WEBHOOK_TS);
        const stale = db.stock.find((s) => s.product_id === "p-stale")!;
        expect(stale.quantity).toBe(0);
        expect(stale.source_ts).toBe(EXPORT_TS);

        // Compteurs honnêtes : 1 zéroé, 1 protégé (compté, jamais silencieux).
        expect(r.stock_zeroed).toBe(1);
        expect(r.stock_stale_skipped).toBe(1);
        expect(calls.zero_lte_used).toBeGreaterThan(0);

        // Effets dérivés UNIQUEMENT sur les lignes réellement à 0 : pas d'out_of_stock
        // fantôme ni de vidage de tailles sur le produit protégé.
        const events = db.feed_events.filter((e) => e.event_type === "out_of_stock");
        expect(events.map((e) => e.product_id)).toEqual(["p-stale"]);
        expect(db.products.find((p) => p.id === "p-fresh")!.available_sizes).toEqual([{ size: "42", quantity: 4 }]);
        expect(db.products.find((p) => p.id === "p-stale")!.available_sizes).toEqual([]);
    });

    it("PARITÉ preview ↔ apply : le dryRun annonce les MÊMES passages à 0 que l'apply (garde comprise)", async () => {
        // Finding HIGH revue SF : le preview comptait TOUS les candidats sans la garde
        // → le wizard sur-annonçait les ruptures (le client envoie toujours
        // file_last_modified). Même seed que le test précédent : 1 protégé, 1 zéroable.
        const seed: Partial<Store> = {
            products: [
                { id: "p-fresh", merchant_id: M, ean: "3017620422003", name: "Restocké Webhook", sku: null, available_sizes: [] },
                { id: "p-stale", merchant_id: M, ean: "0036000291452", name: "Vendu Depuis Longtemps", sku: null, available_sizes: [] },
            ],
            stock: [
                { product_id: "p-fresh", quantity: 4, source: "webhook", source_ts: WEBHOOK_TS },
                { product_id: "p-stale", quantity: 6, source: "file_push", source_ts: OLD_TS },
            ],
        };
        const { admin, db } = makeAdmin(seed);
        const csv = ["Code-barres;Désignation;Quantité;Prix", "4006381333931;Autre Produit;9;3,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage, sourceTs: EXPORT_TS, dryRun: true });

        // Non-vacant : sans le fix, stock_zeroed=2 (sur-annonce) et stale=0.
        expect(r.dry_run).toBe(true);
        expect(r.stock_zeroed).toBe(1);
        expect(r.stock_stale_skipped).toBe(1);
        // Simulation : AUCUNE écriture.
        expect(db.stock.find((s) => s.product_id === "p-fresh")!.quantity).toBe(4);
        expect(db.stock.find((s) => s.product_id === "p-stale")!.quantity).toBe(6);
        expect(db.feed_events).toHaveLength(0);
    });

    it("SANS sourceTs explicite : chemin historique intact (pas de .lte, tout candidat zéroé, 0 stale compté)", async () => {
        const seed: Partial<Store> = {
            products: [{ id: "p-any", merchant_id: M, ean: "3017620422003", name: "Ancien", sku: null, available_sizes: [] }],
            stock: [{ product_id: "p-any", quantity: 5, source: "webhook", source_ts: WEBHOOK_TS }],
        };
        const { admin, db, calls } = makeAdmin(seed);
        const csv = ["Code-barres;Désignation;Quantité;Prix", "4006381333931;Autre;9;3,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: true, coverage });

        expect(db.stock.find((s) => s.product_id === "p-any")!.quantity).toBe(0);
        expect(r.stock_zeroed).toBe(1);
        expect(r.stock_stale_skipped).toBe(0);
        expect(calls.zero_lte_used).toBe(0); // aucune garde ajoutée au chemin historique
    });
});

describe("GATED FILE_PUSH_ATOMIC_STOCK=1 — REPLACE via la RPC batch (garde 104 en set, migration 112)", () => {
    it("flag ON : un REPLACE périmé n'écrase PAS une vente webhook plus fraîche ; rejet COMPTÉ, pas une erreur", async () => {
        process.env.FILE_PUSH_ATOMIC_STOCK = "1";
        const seed: Partial<Store> = {
            products: [{ id: "p-sold", merchant_id: M, ean: "3017620422003", name: "Vendu 08h", sku: null, available_sizes: [] }],
            stock: [{ product_id: "p-sold", quantity: 0, source: "webhook", source_ts: WEBHOOK_TS }],
        };
        const { admin, db, calls } = makeAdmin(seed);
        // L'export de 02:00 croit encore p-sold à 5 (généré AVANT la vente de 08:00).
        const csv = ["Code-barres;Désignation;Quantité;Prix", "3017620422003;Vendu 08h;5;2,00", "0036000291452;Nouveau;3;1,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage, sourceTs: EXPORT_TS });

        // Non-vacant : flag OFF / upsert direct, p-sold repasserait à 5 = LE faux « en
        // stock » n°1 de l'audit (produit vendu affiché disponible).
        const sold = db.stock.find((s) => s.product_id === "p-sold")!;
        expect(sold.quantity).toBe(0);
        expect(sold.source_ts).toBe(WEBHOOK_TS);
        // Le produit NEUF est écrit normalement (première vérité).
        const pNew = db.products.find((p) => p.ean === "0036000291452")!;
        expect(db.stock.find((s) => s.product_id === pNew.id)!.quantity).toBe(3);
        // Comptage honnête : 1 écrit, 1 rejeté stale — et PAS d'erreur (c'est la garde).
        expect(r.stock_replaced).toBe(1);
        expect(r.stock_stale_skipped).toBe(1);
        expect(r.errors).toEqual([]);
        expect(calls.rpc_batch).toBe(1);
        expect(calls.stock_upsert).toBe(0); // jamais d'upsert direct quand la RPC répond
    });

    it("flag ON : borne SCALE préservée — 1200 lignes = ceil(1200/500)=3 appels RPC, jamais O(N)", async () => {
        process.env.FILE_PUSH_ATOMIC_STOCK = "1";
        const { admin, db, calls } = makeAdmin();
        const lines = ["Code-barres;Désignation;Référence;Quantité;Prix"];
        for (let i = 0; i < 1200; i++) lines.push(`;Produit ${i};SKU-${i};${(i % 9) + 1};9,99`);
        const { items, coverage } = parseStockFile(Buffer.from(lines.join("\n"), "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage, sourceTs: EXPORT_TS });

        expect(calls.rpc_batch).toBe(3);
        expect(r.stock_replaced).toBe(1200);
        expect(r.stock_stale_skipped).toBe(0);
        expect(db.stock).toHaveLength(1200);
    });

    it("flag ON sans migration (RPC absente) : repli upsert direct SIGNALÉ — le push n'est JAMAIS perdu", async () => {
        process.env.FILE_PUSH_ATOMIC_STOCK = "1";
        const { admin, db, calls } = makeAdmin({}, { failRpc: true });
        const csv = ["Code-barres;Désignation;Quantité;Prix", "3017620422003;Produit;5;2,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage, sourceTs: EXPORT_TS });

        // Repli : la donnée est écrite (sémantique prod actuelle), la dégradation est
        // VISIBLE côté ops (Sentry) — jamais un push perdu pour appliquer une garde.
        expect(db.stock).toHaveLength(1);
        expect(r.stock_replaced).toBe(1);
        expect(calls.stock_upsert).toBe(1);
        expect(captureError).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining("does not exist") }),
            expect.objectContaining({ phase: "stock-batch-rpc-fallback", merchantId: M }),
        );
    });

    it("flag OFF (défaut) : upsert direct, 0 appel RPC — comportement historique byte-identique", async () => {
        const { admin, calls } = makeAdmin();
        const csv = ["Code-barres;Désignation;Quantité;Prix", "3017620422003;Produit;5;2,00"].join("\n");
        const { items, coverage } = parseStockFile(Buffer.from(csv, "utf-8"));

        const r = await ingestStockSnapshot(M, items, admin, { reconcile: false, coverage });

        expect(calls.rpc_batch).toBe(0);
        expect(calls.stock_upsert).toBe(1);
        expect(r.stock_replaced).toBe(1);
        expect(r.stock_stale_skipped).toBe(0);
    });
});

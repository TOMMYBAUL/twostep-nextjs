import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * HOT PATH facture → catalogue/stock (`POST /api/invoices/[id]/validate`).
 *
 * North-star §1 : « capter le stock de N'IMPORTE QUELLE source en n'OUBLIANT RIEN ».
 * Une facture = MARCHANDISE REÇUE. La route validate CRÉE/MET À JOUR des produits et
 * ÉCRIT du stock (`source:"invoice"`). C'était un des derniers gros chemins d'écriture
 * stock SANS aucun test, et il portait plusieurs PERTES SILENCIEUSES réelles (vérifiées
 * dans le code, pas supposées) — toutes du même motif que les maillons 2/8 déjà durcis :
 *
 *  1. Branche NEW PRODUCT : `insertErr` était destructuré mais JAMAIS remonté
 *     (console.log en dev only). Un insert produit qui échoue → `newProduct=null` →
 *     produit DROPPÉ en silence (0 stock, 0 invoice_item lié, 0 compteur) alors que la
 *     facture finissait « validée ». Perte d'inventaire invisible.
 *  2. Branche EXACT MATCH : la lecture `currentStock` avalait son `error` → `data=null`
 *     indistinct de « pas de stock » → l'upsert ÉCRASAIT la qté réelle existante par la
 *     seule qté facture (read-modify-write corrompu) = perte de stock silencieuse.
 *  3. Les inserts/upserts de stock n'étaient pas vérifiés → `stock_updated` comptait des
 *     écritures en échec (faux succès).
 *  4. Le `catch {}` global renvoyait 500 SANS captureError → tout crash de ce hot path
 *     était invisible en prod.
 *
 * Méthode qualité (priorities §1bis) : on drive la VRAIE route avec un faux client
 * Supabase qui ENREGISTRE les écritures et permet d'INJECTER des erreurs ciblées — on
 * inspecte la table résultante (payload exact) et on prouve que chaque échec est rendu
 * VISIBLE (captureError + champ `errors`), pas avalé.
 */

// ─── Mocks de modules (deps de la route) ────────────────────────────────────
const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => null) }));

// Grouping déterministe : extraction de taille pilotable (par défaut aucune → chaque
// libellé = son propre groupe). On peut forcer une taille pour exercer le merge available_sizes.
const extractSizeMock = vi.fn(() => null as string | null);
vi.mock("@/lib/pos/extract-size", () => ({
    extractSize: () => extractSizeMock(),
    stripSize: (s: string) => s,
}));

// Index produits + matching : pilotés par scénario.
const matchProductMock = vi.fn();
const buildProductIndexMock = vi.fn(async () => ({}));
vi.mock("@/lib/enrichment/match-product", () => ({
    buildProductIndex: (...a: unknown[]) => buildProductIndexMock(...a),
    matchProduct: (...a: unknown[]) => matchProductMock(...a),
}));

// Enrichissement / catégorisation / regroupage / lookup EAN : inertes (hors périmètre).
vi.mock("@/lib/enrichment/resolve-ean", () => ({ resolveAndEnrich: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/categorize", () => ({ categorizeMerchantProducts: vi.fn(async () => {}) }));
vi.mock("@/lib/pos/sync-engine", () => ({ groupVariantsByEAN: vi.fn(async () => {}) }));
vi.mock("@/lib/ean/lookup", () => ({ fetchEanData: vi.fn(async () => null) }));

// ─── Faux client Supabase : query-builder thenable + état partagé ───────────
type WriteRec = { table: string; op: string; payload: unknown };

interface State {
    merchantId: string;
    invoice: Record<string, unknown>;
    writes: WriteRec[];
    // Réponses pilotables :
    stockRead: { data: unknown; error: unknown };
    productInsert: { data: unknown; error: unknown };
    productsReadErr: unknown; // erreur injectée sur les SELECT products (lecture available_sizes/photo)
    writeErrors: Record<string, unknown>; // clé `${table}:${op}` → error
    throwOnBuildIndex?: boolean;
}

function makeState(over: Partial<State> = {}): State {
    return {
        merchantId: "merch-1",
        invoice: {
            id: "inv-1",
            merchant_id: "merch-1",
            status: "parsed",
            invoice_items: [],
        },
        writes: [],
        stockRead: { data: null, error: null },
        productInsert: { data: { id: "new-prod-1" }, error: null },
        productsReadErr: null,
        writeErrors: {},
        ...over,
    };
}

class FakeQuery {
    op = "select";
    payload: unknown = null;
    constructor(private table: string, private state: State) {}
    select() { return this; }
    insert(p: unknown) { this.op = "insert"; this.payload = p; return this; }
    update(p: unknown) { this.op = "update"; this.payload = p; return this; }
    upsert(p: unknown) { this.op = "upsert"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    eq() { return this; }
    neq() { return this; }
    not() { return this; }
    in() { return this; }
    is() { return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { return this._resolve(); }
    single() { return this._resolve(); }
    then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return this._resolve().then(onF, onR);
    }
    private _resolve(): Promise<{ data: unknown; error: unknown }> {
        const { table, op, payload, state } = this;
        if (op === "insert" || op === "update" || op === "upsert" || op === "delete") {
            state.writes.push({ table, op, payload });
            if (table === "products" && op === "insert") {
                return Promise.resolve(state.productInsert);
            }
            const err = state.writeErrors[`${table}:${op}`] ?? null;
            return Promise.resolve({ data: null, error: err });
        }
        // reads
        if (table === "merchants") return Promise.resolve({ data: { id: state.merchantId }, error: null });
        if (table === "invoices") return Promise.resolve({ data: state.invoice, error: null });
        if (table === "products") {
            if (state.productsReadErr) return Promise.resolve({ data: null, error: state.productsReadErr });
            // match branch lit available_sizes ; enrich lit name/photo_url → objet fusionné
            return Promise.resolve({ data: { available_sizes: [], name: "x", photo_url: null }, error: null });
        }
        if (table === "stock") return Promise.resolve(state.stockRead);
        return Promise.resolve({ data: null, error: null });
    }
}

function makeClient(state: State, withAuth: boolean) {
    const client: Record<string, unknown> = {
        from: (table: string) => new FakeQuery(table, state),
    };
    if (withAuth) {
        client.auth = { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) };
    }
    return client;
}

let currentState: State;
vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => makeClient(currentState, true),
}));
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => makeClient(currentState, false),
}));

// Import APRÈS les mocks.
import { POST } from "@/app/api/invoices/[id]/validate/route";

function fakeReq() {
    return {
        headers: { get: () => null },
        json: async () => ({}),
    } as unknown as Parameters<typeof POST>[0];
}
function ctx(id = "inv-1") {
    return { params: Promise.resolve({ id }) };
}
function item(over: Record<string, unknown> = {}) {
    return { id: "it-1", name: "Nike Dunk Low", ean: "0123456789012", sku: null, quantity: 3, unit_price_ht: 50, status: "pending", ...over };
}

beforeEach(() => {
    vi.clearAllMocks();
    matchProductMock.mockReturnValue(null);
    buildProductIndexMock.mockResolvedValue({});
    extractSizeMock.mockReturnValue(null);
});

describe("invoices/validate — écriture catalogue/stock SANS perte silencieuse", () => {
    it("happy path NEW PRODUCT : crée le produit + écrit le stock (source:invoice)", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
        });
        matchProductMock.mockReturnValue(null); // aucun match → création

        const res = await POST(fakeReq(), ctx());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.products_created).toBe(1);
        expect(body.stock_updated).toBe(1);
        expect(body.errors).toBeUndefined();

        const stockInsert = currentState.writes.find((w) => w.table === "stock" && w.op === "insert");
        expect(stockInsert).toBeTruthy();
        expect((stockInsert!.payload as any).quantity).toBe(3);
        expect((stockInsert!.payload as any).source).toBe("invoice");
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("BUG #1 — insert produit échoué → PAS de drop silencieux : captureError + errors, pas de stock fantôme", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
            productInsert: { data: null, error: { message: "duplicate key" } },
        });
        matchProductMock.mockReturnValue(null);

        const res = await POST(fakeReq(), ctx());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.products_created).toBe(0);
        expect(body.stock_updated).toBe(0);
        expect(body.errors).toBeTruthy();
        expect(body.errors.some((e: string) => e.includes("Create"))).toBe(true);
        // Le produit a été droppé → AUCUN insert stock ne doit avoir eu lieu.
        expect(currentState.writes.find((w) => w.table === "stock")).toBeUndefined();
        // L'échec est REMONTÉ (create-product + partial), plus jamais avalé.
        const contexts = captureMock.mock.calls.map((c) => (c[1] as any)?.context);
        expect(contexts).toContain("invoices-validate-create-product");
    });

    it("EXACT MATCH : la marchandise reçue est AJOUTÉE au stock existant (jamais écrasée)", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item({ quantity: 3 })] },
            stockRead: { data: { quantity: 5 }, error: null },
        });
        matchProductMock.mockReturnValue({ productId: "prod-1", product: {}, matchType: "exact_ean" });

        const res = await POST(fakeReq(), ctx());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.products_updated).toBe(1);
        const stockUpsert = currentState.writes.find((w) => w.table === "stock" && w.op === "upsert");
        expect(stockUpsert).toBeTruthy();
        // 5 (existant) + 3 (facture) = 8 — ADDITION, pas remplacement par 3.
        expect((stockUpsert!.payload as any).quantity).toBe(8);
        expect((stockUpsert!.payload as any).source).toBe("invoice");
    });

    it("BUG #2 — lecture stock en échec → on N'ÉCRASE PAS l'existant + captureError (pas de wipe silencieux)", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item({ quantity: 3 })] },
            stockRead: { data: null, error: { message: "db timeout" } },
        });
        matchProductMock.mockReturnValue({ productId: "prod-1", product: {}, matchType: "exact_ean" });

        const res = await POST(fakeReq(), ctx());
        const body = await res.json();

        expect(res.status).toBe(200);
        // Aucun upsert stock : on préserve la qté existante plutôt que la wiper.
        expect(currentState.writes.find((w) => w.table === "stock" && w.op === "upsert")).toBeUndefined();
        expect(body.stock_updated).toBe(0);
        expect(body.errors.some((e: string) => e.includes("Stock read"))).toBe(true);
        const contexts = captureMock.mock.calls.map((c) => (c[1] as any)?.context);
        expect(contexts).toContain("invoices-validate-stock-read");
    });

    it("BUG #3 — insert stock (création) en échec → compté comme échec + Sentry, pas faux succès", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
            productInsert: { data: { id: "new-prod-1" }, error: null },
            writeErrors: { "stock:insert": { message: "fk violation" } },
        });
        matchProductMock.mockReturnValue(null);

        const res = await POST(fakeReq(), ctx());
        const body = await res.json();

        expect(body.products_created).toBe(1); // le produit existe
        expect(body.stock_updated).toBe(0); // mais le stock n'est PAS compté
        expect(body.errors.some((e: string) => e.includes("Stock (création)"))).toBe(true);
        const contexts = captureMock.mock.calls.map((c) => (c[1] as any)?.context);
        expect(contexts).toContain("invoices-validate-create-stock");
    });

    it("BUG #5 — lecture available_sizes en échec → tailles existantes PRÉSERVÉES (pas d'écrasement) + Sentry", async () => {
        extractSizeMock.mockReturnValue("42"); // l'article porte une taille → branche merge available_sizes
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item({ quantity: 3 })] },
            stockRead: { data: { quantity: 5 }, error: null },
            productsReadErr: { message: "db read failed" },
        });
        matchProductMock.mockReturnValue({ productId: "prod-1", product: {}, matchType: "exact_ean" });

        const res = await POST(fakeReq(), ctx());
        const body = await res.json();

        expect(res.status).toBe(200);
        // L'UPDATE produit ne doit PAS porter available_sizes (préservation des tailles réelles).
        const prodUpdate = currentState.writes.find((w) => w.table === "products" && w.op === "update");
        expect(prodUpdate).toBeTruthy();
        expect((prodUpdate!.payload as any).available_sizes).toBeUndefined();
        expect(body.errors.some((e: string) => e.includes("Sizes read"))).toBe(true);
        const contexts = captureMock.mock.calls.map((c) => (c[1] as any)?.context);
        expect(contexts).toContain("invoices-validate-sizes-read");
    });

    it("BUG #6 — MAJ statut facture en échec → 200 mais échec RENDU VISIBLE (pas de faux 'validée')", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
            writeErrors: { "invoices:update": { message: "status write failed" } },
        });
        matchProductMock.mockReturnValue(null);

        const res = await POST(fakeReq(), ctx());
        const body = await res.json();

        expect(body.errors.some((e: string) => e.includes("Invoice status"))).toBe(true);
        const contexts = captureMock.mock.calls.map((c) => (c[1] as any)?.context);
        expect(contexts).toContain("invoices-validate-status");
    });

    it("BUG #4 — crash inattendu du hot path → captureError + 500 (plus jamais invisible)", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
        });
        buildProductIndexMock.mockRejectedValue(new Error("boom"));

        const res = await POST(fakeReq(), ctx());
        expect(res.status).toBe(500);
        const contexts = captureMock.mock.calls.map((c) => (c[1] as any)?.context);
        expect(contexts).toContain("invoices-validate");
    });
});

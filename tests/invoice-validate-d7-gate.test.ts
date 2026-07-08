import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GARDE D7 sur le chemin FACTURE (`POST /api/invoices/[id]/validate`) —
 * audit ultracode 2026-07-08, finding M3 CRITIQUE.
 *
 * Le scénario interdit par le north-star (« exactitude = la promesse », zéro faux
 * positif) était RÉELLEMENT atteignable en prod par ce chemin jumeau :
 * une ligne de facture « Chaussettes coton bio » avec un EAN mal tapé résolu en
 * « Coca-Cola Zero » par une source externe était créée avec les DÉFAUTS DB
 * (`visible=true` migration 027, `review_status='validated'` migration 081), le
 * mauvais `canonical_name`, puis publiée au feed conso et éligible Google — sans
 * jamais passer par la cascade de score ni la concordance D7 que le chemin jumeau
 * ingestStockSnapshot traverse (enrichment_jobs → enrichOneProduct → runCascade).
 *
 * Le fix (3 verrous, tous prouvés ici) :
 *  1. INSERT gated : `visible:false, review_status:'pending'` (parité snapshot) —
 *     rien ne s'auto-publie sur une identité jamais scorée.
 *  2. Adoption pré-insert du nom résolu par fetchEanData GARDÉE par
 *     `evalIdentityConcordance` (MÊME helper que runCascade — source unique) :
 *     divergence claire → on n'adopte NI nom NI marque NI catégorie.
 *  3. Enrichissement inline (resolveAndEnrich, sans D7) REMPLACÉ par l'enfilage
 *     enrichment_jobs → le worker applique cascade + concordance + visibilité.
 *
 * Méthode : on drive la VRAIE route avec le faux client Supabase du harnais
 * invoice-validate-writes ; la concordance utilise le VRAI scoreNameMatch
 * (module ean/lookup réel, seul fetchEanData est stubbé) — test non vacant.
 */

// ─── Mocks de modules (mêmes que invoice-validate-writes) ───────────────────
const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => null) }));

const extractSizeMock = vi.fn(() => null as string | null);
vi.mock("@/lib/pos/extract-size", () => ({
    extractSize: () => extractSizeMock(),
    stripSize: (s: string) => s,
}));

const matchProductMock = vi.fn();
const buildProductIndexMock = vi.fn(async () => ({}));
vi.mock("@/lib/enrichment/match-product", () => ({
    buildProductIndex: (...a: unknown[]) => buildProductIndexMock(...a),
    matchProduct: (...a: unknown[]) => matchProductMock(...a),
}));

vi.mock("@/lib/ai/categorize", () => ({ categorizeMerchantProducts: vi.fn(async () => {}) }));
vi.mock("@/lib/pos/sync-engine", () => ({ groupVariantsByEAN: vi.fn(async () => {}) }));

// fetchEanData pilotable par scénario ; le RESTE du module ean/lookup est RÉEL
// (scoreNameMatch réel → la concordance D7 exercée ici n'est pas un stub).
const fetchEanDataMock = vi.fn(async (): Promise<unknown> => null);
vi.mock("@/lib/ean/lookup", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/ean/lookup")>();
    return { ...actual, fetchEanData: (...a: unknown[]) => fetchEanDataMock(...(a as [])) };
});

// ─── Faux client Supabase (harnais invoice-validate-writes) ─────────────────
type WriteRec = { table: string; op: string; payload: unknown };

interface State {
    merchantId: string;
    invoice: Record<string, unknown>;
    writes: WriteRec[];
    productInsert: { data: unknown; error: unknown };
    /** Réponses injectées, consommées dans l'ordre, pour les insert enrichment_jobs. */
    enrichmentInsertErrors: unknown[];
}

function makeState(over: Partial<State> = {}): State {
    return {
        merchantId: "merch-1",
        invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [] },
        writes: [],
        productInsert: { data: { id: "new-prod-1" }, error: null },
        enrichmentInsertErrors: [],
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
            if (table === "enrichment_jobs" && op === "insert") {
                const err = state.enrichmentInsertErrors.shift() ?? null;
                return Promise.resolve({ data: null, error: err });
            }
            return Promise.resolve({ data: null, error: null });
        }
        if (table === "merchants") return Promise.resolve({ data: { id: state.merchantId }, error: null });
        if (table === "invoices") return Promise.resolve({ data: state.invoice, error: null });
        if (table === "products") {
            // match branch lit available_sizes ; enrich lit name/photo_url → objet fusionné
            return Promise.resolve({ data: { available_sizes: [], name: "x", photo_url: null }, error: null });
        }
        if (table === "stock") return Promise.resolve({ data: null, error: null });
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
    return { headers: { get: () => null }, json: async () => ({}) } as unknown as Parameters<typeof POST>[0];
}
function ctx(id = "inv-1") {
    return { params: Promise.resolve({ id }) };
}
function item(over: Record<string, unknown> = {}) {
    return { id: "it-1", name: "Chaussettes coton bio", ean: "3017620422003", sku: null, quantity: 3, unit_price_ht: 5, status: "pending", ...over };
}

function productInsertPayload(state: State) {
    const w = state.writes.find((x) => x.table === "products" && x.op === "insert");
    return w ? (w.payload as Record<string, unknown>) : null;
}
function enrichmentInserts(state: State) {
    return state.writes.filter((w) => w.table === "enrichment_jobs" && w.op === "insert");
}

beforeEach(() => {
    vi.clearAllMocks();
    matchProductMock.mockReturnValue(null);
    buildProductIndexMock.mockResolvedValue({});
    extractSizeMock.mockReturnValue(null);
    fetchEanDataMock.mockResolvedValue(null);
});

describe("invoices/validate — garde D7 + gate de publication (audit M3 CRITIQUE)", () => {
    it("RÉGRESSION gate : un produit créé par facture est INVISIBLE et pending (jamais publié par les défauts DB)", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
        });

        const res = await POST(fakeReq(), ctx());
        expect(res.status).toBe(200);

        const payload = productInsertPayload(currentState);
        expect(payload).toBeTruthy();
        // Sans ces 2 champs, les défauts DB publient (visible=true, review_status='validated')
        // une identité jamais scorée → le faux positif cardinal.
        expect(payload!.visible).toBe(false);
        expect(payload!.review_status).toBe("pending");
    });

    it("D7 DIVERGENCE (fixture audit) : EAN résolu « Coca-Cola Zero » sur « Chaussettes coton bio » → identité étrangère NON adoptée, EAN conservé", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
        });
        fetchEanDataMock.mockResolvedValue({
            name: "Coca-Cola Zero, 6 x 33cl",
            brand: "Coca-Cola",
            photo_url: null,
            category: "beverages",
            source: "ean_search",
        });

        const res = await POST(fakeReq(), ctx());
        expect(res.status).toBe(200);

        const payload = productInsertPayload(currentState);
        expect(payload).toBeTruthy();
        // Le mauvais nom ne devient JAMAIS le canonical_name du produit.
        expect(payload!.canonical_name).toBeNull();
        // Ni la marque ni la catégorie de l'identité étrangère ne sont écrites.
        expect(payload!.brand).toBeUndefined();
        expect(payload!.category).toBeUndefined();
        // L'EAN saisi est conservé tel quel : c'est la review (worker + marchand) qui tranche.
        expect(payload!.ean).toBe("3017620422003");
        // Et le produit part invisible/pending (verrou 1) → même si un maillon aval se
        // trompait, rien n'est publié sans verdict.
        expect(payload!.visible).toBe(false);
        expect(payload!.review_status).toBe("pending");
    });

    it("D7 CONCORDANCE (non-régression enrichissement) : nom résolu cohérent → adopté avec marque", async () => {
        currentState = makeState({
            invoice: {
                id: "inv-1", merchant_id: "merch-1", status: "parsed",
                invoice_items: [item({ name: "Nike Air Force 1 blanc" })],
            },
        });
        fetchEanDataMock.mockResolvedValue({
            name: "Nike Air Force 1 '07 White",
            brand: "Nike",
            photo_url: null,
            category: "clothing and fashion",
            source: "ean_search",
        });

        const res = await POST(fakeReq(), ctx());
        expect(res.status).toBe(200);

        const payload = productInsertPayload(currentState);
        expect(payload).toBeTruthy();
        expect(payload!.canonical_name).toBe("Nike Air Force 1 '07 White");
        expect(payload!.brand).toBe("Nike");
        // La catégorie source anglaise est traduite en slug FR (maillon 9 (d)).
        expect(payload!.category).toBe("mode");
    });

    it("les produits créés sont ENFILÉS dans enrichment_jobs (worker → runCascade/D7), plus d'enrichissement inline", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
        });

        const res = await POST(fakeReq(), ctx());
        expect(res.status).toBe(200);

        const jobs = enrichmentInserts(currentState);
        expect(jobs.length).toBe(1);
        expect(jobs[0].payload).toEqual([{ product_id: "new-prod-1", merchant_id: "merch-1" }]);
    });

    it("un produit MATCHÉ sans photo est enfilé aussi (enrichOneProduct complète la photo sans re-scorer un validé)", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
        });
        matchProductMock.mockReturnValue({ productId: "prod-9", product: {}, matchType: "exact_ean" });

        const res = await POST(fakeReq(), ctx());
        expect(res.status).toBe(200);

        const jobs = enrichmentInserts(currentState);
        expect(jobs.length).toBe(1);
        expect(jobs[0].payload).toEqual([{ product_id: "prod-9", merchant_id: "merch-1" }]);
    });

    it("fetchEanData en panne → produit quand même créé (gated) ET panne VISIBLE à Sentry (revue SF-hunter)", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
        });
        fetchEanDataMock.mockRejectedValue(new Error("quota exceeded"));

        const res = await POST(fakeReq(), ctx());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.products_created).toBe(1);
        const payload = productInsertPayload(currentState);
        expect(payload!.visible).toBe(false);
        expect(payload!.review_status).toBe("pending");
        // Une panne systémique (clé/quota/réseau) du pré-enrichissement ne doit plus
        // être un console.error perdu : elle remonte à Sentry.
        const contexts = captureMock.mock.calls.map((c) => (c[1] as any)?.context);
        expect(contexts).toContain("invoices-validate-ean-pre-enrichment");
    });

    it("repli mono-ligne : lot rejeté par l'index unique (job déjà actif) → doublon 23505 IGNORÉ, rien de perdu ni de bruyant", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
            // 1er insert (lot) échoue sur l'unique partiel ; le repli mono-ligne re-heurte le doublon.
            enrichmentInsertErrors: [
                { code: "23505", message: "duplicate key value violates unique constraint" },
                { code: "23505", message: "duplicate key value violates unique constraint" },
            ],
        });

        const res = await POST(fakeReq(), ctx());
        const body = await res.json();

        expect(res.status).toBe(200);
        // Doublon = un job actif existe déjà et fera le travail → ni errors ni Sentry.
        expect(body.errors).toBeUndefined();
        const contexts = captureMock.mock.calls.map((c) => (c[1] as any)?.context);
        expect(contexts).not.toContain("invoices-validate-enqueue-enrichment");
        // Le repli a bien été tenté (lot + mono-ligne).
        expect(enrichmentInserts(currentState).length).toBe(2);
    });

    it("repli mono-ligne : échec RÉEL d'enfilage → VISIBLE (errors + Sentry), jamais un produit sans verdict en silence", async () => {
        currentState = makeState({
            invoice: { id: "inv-1", merchant_id: "merch-1", status: "parsed", invoice_items: [item()] },
            enrichmentInsertErrors: [
                { code: "XX000", message: "db down" },
                { code: "XX000", message: "db down" },
            ],
        });

        const res = await POST(fakeReq(), ctx());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.errors.some((e: string) => e.includes("Enqueue enrichment"))).toBe(true);
        const contexts = captureMock.mock.calls.map((c) => (c[1] as any)?.context);
        expect(contexts).toContain("invoices-validate-enqueue-enrichment");
    });
});

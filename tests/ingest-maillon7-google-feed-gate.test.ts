import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * VALIDATION MAILLON 7 du workflow cœur — SORTIE GOOGLE LFP (le canal de sortie).
 *
 * North-star §1 : « feed Google LFP as a service d'abord ». Google teste la qualité
 * du feed avant d'accorder le statut LFP ; un feed qui annonce un produit fantôme
 * (archivé / supprimé) aux acheteurs = le catalogue fantôme qui a tué MVMS/Milo.
 *
 * Méthode qualité (priorities §1bis) : pas « la fonction pure buildLfpXml passe »
 * (déjà couvert par tests/lib/google/lfp-xml.test.ts) mais le CHEMIN RÉEL — le GATE
 * de la route, càd le SELECT qui décide quels produits atteignent buildLfpXml. C'est
 * exactement le motif maillon 5/6 + store_code : un invariant appliqué de façon
 * INCOHÉRENTE entre deux chemins = même risque qu'un invariant absent.
 *
 * Bug réel prouvé ici (faux positif de sortie, divergence Voie A / Voie B) :
 *   - Voie A (cron `google-feed`, Content API) gate : visible=true AND validated
 *     AND archived_at IS NULL AND variant_of IS NULL.
 *   - Voie B (cette route XML, crawlée par Google) gate AVANT fix : visible=true
 *     AND validated SEULEMENT.
 *   `archive_product` (migration 068, RPC granté `authenticated`) met `archived_at`
 *   SANS toucher `visible` → un produit archivé reste `visible=true` → la Voie B
 *   l'annonce au crawler Google alors que TOUTES les autres surfaces (6 : by-ean,
 *   quality-check, pos/status, dashboard, cron feed, RPC consumer 065) l'excluent.
 *
 * Faux client Supabase read-side : applique réellement `.eq()/.is()` + `.maybeSingle()`
 * et le thenable awaité directement → on exerce le VRAI gate de la route, pas un mock
 * complaisant.
 */

type Row = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Faux client Supabase read-side : un query builder thenable qui accumule les
// filtres .eq/.is et les applique à un dataset mémoire à la résolution.
// Permet aussi d'injecter une erreur DB par table (preuve silent-skip Voie A).
// ─────────────────────────────────────────────────────────────────────────────
type TableData = { rows: Row[]; error: { message: string } | null };

function makeReadClient(tables: Record<string, TableData>) {
    const writes: Array<{ table: string; payload: Row }> = [];

    function builder(table: string) {
        const filters: Array<{ col: string; val: unknown }> = [];
        const td = tables[table] ?? { rows: [], error: null };

        function resolve(): { data: Row[] | null; error: { message: string } | null } {
            if (td.error) return { data: null, error: td.error };
            const rows = td.rows.filter((r) =>
                filters.every((f) => {
                    if (f.val === null) return r[f.col] === null || r[f.col] === undefined;
                    return r[f.col] === f.val;
                }),
            );
            return { data: rows, error: null };
        }

        const api: Record<string, unknown> = {
            select: () => api,
            eq: (col: string, val: unknown) => {
                filters.push({ col, val });
                return api;
            },
            is: (col: string, val: unknown) => {
                filters.push({ col, val });
                return api;
            },
            not: () => api,
            // `.order("id")` (anti-troncature pagination) : dataset déjà déterministe → no-op.
            order: () => api,
            // Pagination KEYSET `fetchAllRows` : `.gt("id", curseur)` puis `.limit(n)`.
            // Dataset de test petit (< pageSize) → 1 seule page : le curseur n'est jamais
            // posé, `.limit()` renvoie tout (et propage une erreur DB injectée).
            gt: () => api,
            limit: () => {
                const { data, error } = resolve();
                return Promise.resolve({ data, error });
            },
            // update(payload).eq(...) → enregistre l'écriture de statut (Voie A cron)
            update: (payload: Row) => ({
                eq: () => {
                    writes.push({ table, payload });
                    return Promise.resolve({ data: null, error: null });
                },
            }),
            maybeSingle: () => {
                const { data, error } = resolve();
                return Promise.resolve({ data: data && data.length > 0 ? data[0] : null, error });
            },
            // thenable : `await admin.from(...).select(...).eq(...)` résout la liste filtrée
            then: (onfulfilled: (v: { data: Row[] | null; error: unknown }) => unknown) =>
                Promise.resolve(resolve()).then(onfulfilled),
        };
        return api;
    }
    return { from: (table: string) => builder(table), __writes: writes };
}

const mockAdmin = { current: null as ReturnType<typeof makeReadClient> | null };
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => mockAdmin.current,
}));

// Voie A (cron) : on inerte les appels Google externes pour isoler le gate read DB.
vi.mock("@/lib/google/merchant", () => ({
    getGoogleAccessToken: vi.fn(async () => ({
        accessToken: "tok",
        connection: { google_merchant_id: "123456" },
    })),
    googleMerchantFetch: vi.fn(async () => ({})),
}));
vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

const MERCHANT_ID = "11111111-1111-1111-1111-111111111111";

const validProduct: Row = {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Nike Air Max 90",
    canonical_name: "Nike Air Max 90 Black/White",
    description: "Sneakers iconiques",
    brand: "Nike",
    ean: "0884776073143",
    price: 129.99,
    photo_url: "https://nike.com/airmax90.jpg",
    photo_processed_url: null,
    stock: [{ quantity: 5 }],
    // colonnes du gate
    merchant_id: MERCHANT_ID,
    visible: true,
    review_status: "validated",
    archived_at: null,
    variant_of: null,
};

describe("Maillon 7 — Voie B (route XML LFP) : gate honnête contre les produits fantômes", () => {
    beforeEach(() => {
        mockAdmin.current = null;
    });

    it("EXCLUT un produit archivé resté visible=true (sinon annoncé au crawler Google = faux positif)", async () => {
        const archivedButVisible: Row = {
            ...validProduct,
            id: "33333333-3333-3333-3333-333333333333",
            ean: "3601234567890", // EAN distinct pour le repérer dans le XML
            canonical_name: "Adidas Stan Smith ARCHIVÉ",
            archived_at: "2026-06-01T10:00:00Z", // archivé...
            visible: true, // ...mais archive_product (068) NE touche PAS visible
            review_status: "validated",
        };

        mockAdmin.current = makeReadClient({
            merchants: { rows: [{ id: MERCHANT_ID, name: "Two-Step Test", status: "active" }], error: null },
            google_merchant_connections: { rows: [{ store_code: "twostep-11111111" }], error: null },
            products: { rows: [validProduct, archivedButVisible], error: null },
        });

        const { GET } = await import("@/app/api/feed/lfp/[merchantId]/route");
        const res = await GET({} as never, { params: Promise.resolve({ merchantId: MERCHANT_ID }) });
        const xml = await res.text();

        expect(res.status).toBe(200);
        // Le produit actif est présent...
        expect(xml).toContain("<g:gtin>0884776073143</g:gtin>");
        // ...le produit ARCHIVÉ est ABSENT (cœur du fix : parité de gate avec Voie A).
        expect(xml).not.toContain("3601234567890");
        expect(xml).not.toContain("ARCHIVÉ");
        const itemCount = (xml.match(/<item>/g) ?? []).length;
        expect(itemCount).toBe(1);
    });

    it("EXCLUT une variante (variant_of non null) — parité défensive avec Voie A", async () => {
        // En pratique sync-engine pose variant_of+visible:false ensemble, mais le gate
        // ne doit pas DÉPENDRE de cette co-occurrence : une variante visible=true (état
        // transitoire / corruption) ne doit jamais fuiter sur Google.
        const visibleVariant: Row = {
            ...validProduct,
            id: "44444444-4444-4444-4444-444444444444",
            ean: "4009999999999",
            canonical_name: "Variante taille 42",
            variant_of: validProduct.id,
            visible: true,
            archived_at: null,
        };

        mockAdmin.current = makeReadClient({
            merchants: { rows: [{ id: MERCHANT_ID, name: "Two-Step Test", status: "active" }], error: null },
            google_merchant_connections: { rows: [{ store_code: "twostep-11111111" }], error: null },
            products: { rows: [validProduct, visibleVariant], error: null },
        });

        const { GET } = await import("@/app/api/feed/lfp/[merchantId]/route");
        const res = await GET({} as never, { params: Promise.resolve({ merchantId: MERCHANT_ID }) });
        const xml = await res.text();

        expect(xml).not.toContain("4009999999999");
        expect((xml.match(/<item>/g) ?? []).length).toBe(1);
    });

    it("laisse passer le produit actif validé visible (non-régression)", async () => {
        mockAdmin.current = makeReadClient({
            merchants: { rows: [{ id: MERCHANT_ID, name: "Two-Step Test", status: "active" }], error: null },
            google_merchant_connections: { rows: [{ store_code: "twostep-11111111" }], error: null },
            products: { rows: [validProduct], error: null },
        });

        const { GET } = await import("@/app/api/feed/lfp/[merchantId]/route");
        const res = await GET({} as never, { params: Promise.resolve({ merchantId: MERCHANT_ID }) });
        const xml = await res.text();

        expect(xml).toContain("<g:gtin>0884776073143</g:gtin>");
        expect(xml).toContain("<g:availability>in stock</g:availability>");
        expect((xml.match(/<item>/g) ?? []).length).toBe(1);
    });

    it("une erreur DB sur le SELECT products → 500 (jamais un feed vide silencieux)", async () => {
        mockAdmin.current = makeReadClient({
            merchants: { rows: [{ id: MERCHANT_ID, name: "Two-Step Test", status: "active" }], error: null },
            google_merchant_connections: { rows: [{ store_code: "twostep-11111111" }], error: null },
            products: { rows: [], error: { message: "connection reset" } },
        });

        const { GET } = await import("@/app/api/feed/lfp/[merchantId]/route");
        const res = await GET({} as never, { params: Promise.resolve({ merchantId: MERCHANT_ID }) });
        expect(res.status).toBe(500);
    });
});

describe("Maillon 7 — Voie A (cron google-feed) : erreur de lecture DB non avalée", () => {
    const req = {
        headers: { get: (k: string) => (k === "authorization" ? "Bearer test-secret" : null) },
    } as never;

    beforeEach(() => {
        mockAdmin.current = null;
        process.env.CRON_SECRET = "test-secret";
        vi.clearAllMocks();
    });

    it("SELECT products en erreur → captureError + statut 'error' (PAS un skip silencieux)", async () => {
        mockAdmin.current = makeReadClient({
            google_merchant_connections: {
                rows: [{ merchant_id: MERCHANT_ID, store_code: "twostep-11111111" }],
                error: null,
            },
            products: { rows: [], error: { message: "connection reset" } },
        });

        const { captureError } = await import("@/lib/error");
        const { POST } = await import("@/app/api/cron/google-feed/route");
        const res = await POST(req);
        const body = await res.json();

        // Le run ne masque pas l'échec : errors compté, et le marchand passe en "error".
        expect(body.errors).toBe(1);
        expect(vi.mocked(captureError)).toHaveBeenCalled();
        const statusWrite = mockAdmin.current!.__writes.find(
            (w) => w.table === "google_merchant_connections" && w.payload.last_feed_status === "error",
        );
        expect(statusWrite).toBeTruthy();
    });

    it("SELECT connections en erreur → 500 + captureError (PAS un 200 'aucun marchand' silencieux)", async () => {
        // Finding 2 (silent-failure-hunter) : un blip DB sur le chargement des connexions
        // faisait no-op silencieux pour TOUS les marchands en HTTP 200.
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [], error: { message: "connection reset" } },
        });

        const { captureError } = await import("@/lib/error");
        const { POST } = await import("@/app/api/cron/google-feed/route");
        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body.error).toBe("db_error");
        expect(vi.mocked(captureError)).toHaveBeenCalled();
    });
});

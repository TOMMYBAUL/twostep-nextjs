import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * COUVERTURE Rang 3 — route handler du cron `google-status` (read-back du canal LFP).
 *
 * Pourquoi ce cron compte (north-star §1) : `google-feed` pousse les produits mais un
 * 200 sur `productInputs:insert` ne garantit PAS l'acceptation (Google traite ensuite en
 * asynchrone et peut rejeter). Ce cron relit `accounts/{account}/products` et rend VISIBLES
 * les rejets (Sentry) — c'est le contrôle du faux positif n°1 (« sur Google » alors que rejeté).
 *
 * Bug réel corrigé ici (même classe que le jumeau google-feed, fix maillon 7) : la lecture de
 * la LISTE `google_merchant_connections` avalait son `error` (`const { data } = …`) → un blip
 * DB → `data=null` → `length===0` → `200 "No Google-connected merchants"` = TOUT le read-back
 * silencieusement abandonné pour TOUS les marchands, 0 Sentry, 0 statut → le contrôle qui
 * existe pour attraper le faux positif n°1 se ré-aveugle lui-même sur un simple hoquet DB.
 * Le blast radius d'un SELECT de liste avalé = tous les items (cf. LESSONS, Finding 2 SF-hunter).
 *
 * Faux client Supabase read-side : applique réellement `.eq()` + thenable awaité, et permet
 * d'injecter une erreur DB par table → on exerce le VRAI chemin de la route, pas un mock complaisant.
 */

type Row = Record<string, unknown>;
type TableData = {
    rows: Row[];
    error: { message: string } | null;
    insertError?: { message: string } | null;
    upsertError?: { message: string } | null;
};

/** Plafond `max-rows` PostgREST simulé : un SELECT rend AU PLUS 1000 lignes, sans erreur. */
const MAX_ROWS = 1000;

function makeReadClient(tables: Record<string, TableData>) {
    const writes: Array<{ table: string; payload: Row }> = [];
    const upserts: Array<{ table: string; payload: Row; opts?: Record<string, unknown> }> = [];

    function builder(table: string) {
        const filters: Array<{ col: string; val: unknown }> = [];
        const gts: Array<{ col: string; val: unknown }> = [];
        let orderCol: string | null = null;
        let limitN: number | null = null;
        const td = tables[table] ?? { rows: [], error: null };

        function resolve(): { data: Row[] | null; error: { message: string } | null } {
            if (td.error) return { data: null, error: td.error };
            let rows = td.rows.filter((r) =>
                filters.every((f) => {
                    if (f.val === null) return r[f.col] === null || r[f.col] === undefined;
                    return r[f.col] === f.val;
                }),
            );
            // KEYSET fetchAllRows : borne basse EXCLUSIVE par valeur (`.gt(col, curseur)`).
            rows = rows.filter((r) => gts.every((g) => (r[g.col] as string) > (g.val as string)));
            if (orderCol) rows = [...rows].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])));
            // Fidèle à PostgREST : plafond min(limit demandé, max-rows), SANS erreur.
            const cap = Math.min(limitN ?? MAX_ROWS, MAX_ROWS);
            if (rows.length > cap) rows = rows.slice(0, cap);
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
            gt: (col: string, val: unknown) => {
                gts.push({ col, val });
                return api;
            },
            order: (col: string) => {
                orderCol = col;
                return api;
            },
            limit: (n: number) => {
                limitN = n;
                return api;
            },
            insert: (payload: Row) => {
                if (td.insertError) return Promise.resolve({ data: null, error: td.insertError });
                writes.push({ table, payload });
                return Promise.resolve({ data: null, error: null });
            },
            upsert: (payload: Row, opts?: Record<string, unknown>) => {
                if (td.upsertError) return Promise.resolve({ data: null, error: td.upsertError });
                upserts.push({ table, payload, opts });
                return Promise.resolve({ data: null, error: null });
            },
            then: (onfulfilled: (v: { data: Row[] | null; error: unknown }) => unknown) =>
                Promise.resolve(resolve()).then(onfulfilled),
        };
        return api;
    }
    return { from: (table: string) => builder(table), __writes: writes, __upserts: upserts };
}

const mockAdmin = { current: null as ReturnType<typeof makeReadClient> | null };
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => mockAdmin.current,
}));

const getGoogleAccessToken = vi.fn();
vi.mock("@/lib/google/merchant", () => ({
    getGoogleAccessToken: (...args: unknown[]) => getGoogleAccessToken(...args),
}));

const fetchProcessedProducts = vi.fn();
const summarizeProductStatuses = vi.fn();
const buildDisapprovalAlerts = vi.fn(() => []);
// Miroir fidèle de la vraie projection (la logique complète — top-10, troncature — est
// prouvée dans tests/lib/google/product-status.test.ts ; ici on vérifie le CÂBLAGE route).
const buildFeedRunRow = vi.fn((summary: Record<string, unknown>, merchantId: string, runAt: Date) => ({
    merchant_id: merchantId,
    day: runAt.toISOString().slice(0, 10),
    run_at: runAt.toISOString(),
    total: summary.total ?? 0,
    served: summary.served ?? 0,
    pending: summary.pending ?? 0,
    disapproved: summary.disapproved ?? 0,
    unknown: summary.unknown ?? 0,
    top_issues: [],
}));
vi.mock("@/lib/google/product-status", () => ({
    fetchProcessedProducts: (...a: unknown[]) => fetchProcessedProducts(...a),
    summarizeProductStatuses: (...a: unknown[]) => summarizeProductStatuses(...a),
    buildDisapprovalAlerts: (...a: unknown[]) => buildDisapprovalAlerts(...a),
    buildFeedRunRow: (...a: unknown[]) => buildFeedRunRow(...(a as [Record<string, unknown>, string, Date])),
}));

vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

const MERCHANT_ID = "11111111-1111-1111-1111-111111111111";

function authedReq() {
    return {
        headers: { get: (k: string) => (k === "authorization" ? "Bearer test-secret" : null) },
    } as never;
}

function emptySummary(over: Partial<Record<string, unknown>> = {}) {
    return {
        total: 0,
        served: 0,
        pending: 0,
        disapproved: 0,
        issues: [],
        disapprovedOfferIds: [],
        ...over,
    };
}

describe("cron/google-status — read-back du statut Google (route handler)", () => {
    beforeEach(() => {
        mockAdmin.current = null;
        process.env.CRON_SECRET = "test-secret";
        delete process.env.GOOGLE_DISAPPROVAL_ALERTS;
        delete process.env.GOOGLE_FEED_RUNS_HISTORY;
        vi.clearAllMocks();
        getGoogleAccessToken.mockResolvedValue({
            accessToken: "tok",
            connection: { google_merchant_id: "123456" },
        });
        summarizeProductStatuses.mockReturnValue(emptySummary());
        fetchProcessedProducts.mockResolvedValue([]);
        buildDisapprovalAlerts.mockReturnValue([]);
    });

    it("rejette une requête sans bearer cron → 401 (aucune lecture DB)", async () => {
        mockAdmin.current = makeReadClient({});
        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST({ headers: { get: () => null } } as never);
        expect(res.status).toBe(401);
    });

    it("SELECT connections en erreur → 500 + captureError (PAS un 200 'aucun marchand' silencieux)", async () => {
        // LE FIX : un blip DB sur le chargement des connexions désactivait silencieusement
        // tout le read-back en HTTP 200 — exactement le jumeau du bug google-feed maillon 7.
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [], error: { message: "connection reset" } },
        });

        const { captureError } = await import("@/lib/error");
        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body.error).toBe("db_error");
        expect(body.message).toContain("connection reset");
        expect(vi.mocked(captureError)).toHaveBeenCalled();
        // On ne doit jamais avoir tenté de lire le statut Google après un échec de liste.
        expect(getGoogleAccessToken).not.toHaveBeenCalled();
    });

    it("0 connexion (liste vide SANS erreur) → 200 'No Google-connected merchants' (no-op légitime, distinct de l'erreur)", async () => {
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [], error: null },
        });
        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.merchants).toBe(0);
        expect(getGoogleAccessToken).not.toHaveBeenCalled();
    });

    it("token Google indisponible → marchand compté en 'errors' + captureError, jamais confondu avec '0 rejet'", async () => {
        getGoogleAccessToken.mockResolvedValueOnce(null);
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }], error: null },
        });

        const { captureError } = await import("@/lib/error");
        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.errors).toBe(1);
        expect(body.disapproved_total).toBe(0);
        expect(vi.mocked(captureError)).toHaveBeenCalled();
        // token mort ≠ lecture de statut : on ne doit pas avoir appelé fetchProcessedProducts.
        expect(fetchProcessedProducts).not.toHaveBeenCalled();
    });

    it("happy path : rejets Google remontés via captureError + agrégat per_merchant honnête", async () => {
        summarizeProductStatuses.mockReturnValue(
            emptySummary({
                total: 10,
                served: 7,
                pending: 1,
                disapproved: 2,
                issues: [
                    { code: "image_link_problem", count: 2, severity: "DISAPPROVED" },
                    { code: "pending_review", count: 1, severity: "PENDING" },
                ],
                disapprovedOfferIds: ["offer-a", "offer-b"],
            }),
        );
        fetchProcessedProducts.mockResolvedValue([{ id: "x" }]);
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }], error: null },
        });

        const { captureError } = await import("@/lib/error");
        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.merchants).toBe(1);
        expect(body.disapproved_total).toBe(2);
        expect(body.errors).toBe(0);
        expect(body.per_merchant).toEqual([
            { merchant_id: MERCHANT_ID, total: 10, served: 7, pending: 1, disapproved: 2 },
        ]);
        // Les rejets sont rendus VISIBLES (Sentry), jamais avalés.
        expect(vi.mocked(captureError)).toHaveBeenCalled();
        // Sans le flag, aucune persistance quality_alerts (gated migration 106).
        expect(mockAdmin.current!.__writes).toHaveLength(0);
    });

    it("flag ON : lecture de dédup quality_alerts en erreur → captureError + SKIP l'insert (pas de doublons sur blip DB)", async () => {
        // Finding A (revue SF-hunter) : `open ?? []` sur un blip DB traiterait tout comme
        // neuf → ré-insertion en double à chaque cron. On rend l'erreur visible et on skip.
        process.env.GOOGLE_DISAPPROVAL_ALERTS = "1";
        summarizeProductStatuses.mockReturnValue(
            emptySummary({ total: 5, disapproved: 1, issues: [{ code: "x", count: 1, severity: "DISAPPROVED" }] }),
        );
        fetchProcessedProducts.mockResolvedValue([{ id: "p" }]);
        buildDisapprovalAlerts.mockReturnValue([{ merchant_id: MERCHANT_ID, product_id: "p", type: "google_disapproved", status: "open", detail: "x" }]);
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }], error: null },
            quality_alerts: { rows: [], error: { message: "dedup read blip" } },
        });

        const { captureError } = await import("@/lib/error");
        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        expect(res.status).toBe(200);
        // Aucune insertion tentée (on ne peut pas dédupliquer en aveugle).
        expect(mockAdmin.current!.__writes).toHaveLength(0);
        // L'erreur de dédup est remontée (step load-open-alerts), + le rejet Google lui-même.
        const calls = vi.mocked(captureError).mock.calls.map((c) => (c[1] as { step?: string })?.step);
        expect(calls).toContain("load-open-alerts");
    });

    it("flag ON : INSERT quality_alerts en erreur (ex. contrainte 106 absente) → captureError, jamais avalé", async () => {
        // Finding B (revue SF-hunter) : l'INSERT best-effort ne doit pas être silencieux.
        process.env.GOOGLE_DISAPPROVAL_ALERTS = "1";
        summarizeProductStatuses.mockReturnValue(
            emptySummary({ total: 5, disapproved: 1, issues: [{ code: "x", count: 1, severity: "DISAPPROVED" }] }),
        );
        fetchProcessedProducts.mockResolvedValue([{ id: "p" }]);
        buildDisapprovalAlerts.mockReturnValue([{ merchant_id: MERCHANT_ID, product_id: "p", type: "google_disapproved", status: "open", detail: "x" }]);
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }], error: null },
            quality_alerts: { rows: [], error: null, insertError: { message: "violates check constraint" } },
        });

        const { captureError } = await import("@/lib/error");
        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        expect(res.status).toBe(200);
        const calls = vi.mocked(captureError).mock.calls.map((c) => (c[1] as { step?: string })?.step);
        expect(calls).toContain("insert-alerts");
    });

    it("erreur de lecture de statut d'UN marchand → comptée en 'errors', n'arrête pas les autres", async () => {
        fetchProcessedProducts
            .mockRejectedValueOnce(new Error("Google 503"))
            .mockResolvedValueOnce([{ id: "ok" }]);
        summarizeProductStatuses.mockReturnValue(emptySummary({ total: 3, served: 3 }));
        const M2 = "22222222-2222-2222-2222-222222222222";
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }, { merchant_id: M2 }], error: null },
        });

        const { captureError } = await import("@/lib/error");
        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.merchants).toBe(2);
        expect(body.errors).toBe(1);
        // le 2e marchand a bien été traité malgré l'échec du 1er
        expect(body.per_merchant).toHaveLength(1);
        expect(vi.mocked(captureError)).toHaveBeenCalled();
    });

    // ── SCALE >1000 : anti-troncature `max-rows` (classe LESSONS silent-truncation) ──

    it("SCALE : 1500 connexions → les 1500 marchands relus (liste PAGINÉE keyset, pas plafonnée à 1000)", async () => {
        // Sans fetchAllRows, PostgREST rend 1000 lignes SANS erreur → le read-back des
        // 500 marchands suivants serait silencieusement abandonné à chaque cron.
        const conns = Array.from({ length: 1500 }, (_, i) => ({
            merchant_id: `m${String(i).padStart(5, "0")}`,
        }));
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: conns, error: null },
        });
        summarizeProductStatuses.mockReturnValue(emptySummary({ total: 1 }));

        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.merchants).toBe(1500); // pas 1000
        expect(body.per_merchant).toHaveLength(1500);
        expect(body.errors).toBe(0);
    });

    it("SCALE flag ON : dédup >1000 alertes ouvertes PAGINÉE — une alerte déjà ouverte au-delà de la 1000ᵉ n'est PAS ré-insérée", async () => {
        // P0-12 : la dédup plafonnée à 1000 rendait le set PARTIEL → un produit déjà alerté
        // hors des 1000 premiers repassait dans `fresh` → INSERT en violation du partial-unique
        // `uq_quality_alerts_open` → tout le lot rejeté = 0 alerte persistée ce run, en silence.
        process.env.GOOGLE_DISAPPROVAL_ALERTS = "1";
        summarizeProductStatuses.mockReturnValue(
            emptySummary({ total: 5, disapproved: 1, issues: [{ code: "x", count: 1, severity: "DISAPPROVED" }] }),
        );
        fetchProcessedProducts.mockResolvedValue([{ id: "p" }]);
        // Le produit re-signalé par Google est DÉJÀ ouvert, à la position 1150 (> 1000).
        const beyond = `prod-${String(1150).padStart(5, "0")}`;
        buildDisapprovalAlerts.mockReturnValue([
            { merchant_id: MERCHANT_ID, product_id: beyond, type: "google_disapproved", status: "open", detail: "x" },
        ]);
        const openAlerts = Array.from({ length: 1200 }, (_, i) => ({
            id: `a${String(i).padStart(5, "0")}`, // colonne-curseur keyset
            product_id: `prod-${String(i).padStart(5, "0")}`,
            merchant_id: MERCHANT_ID,
            type: "google_disapproved",
            status: "open",
        }));
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }], error: null },
            quality_alerts: { rows: openAlerts, error: null },
        });

        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());

        expect(res.status).toBe(200);
        // Dédup COMPLÈTE (2 pages keyset) → l'alerte déjà ouverte n'est jamais ré-insérée
        // (une dédup tronquée à 1000 l'aurait crue « neuve » → violation d'unique → lot perdu).
        expect(mockAdmin.current!.__writes).toHaveLength(0);
    });

    // ── G2 — historique feed-quality `google_feed_runs` (gated migration 114 + flag) ──

    it("G2 flag OFF (défaut) : AUCUNE écriture google_feed_runs — prod byte-identique", async () => {
        summarizeProductStatuses.mockReturnValue(emptySummary({ total: 5, served: 5 }));
        fetchProcessedProducts.mockResolvedValue([{ id: "ok" }]);
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }], error: null },
        });

        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.feed_runs_written).toBe(0);
        expect(mockAdmin.current!.__upserts).toHaveLength(0);
        expect(buildFeedRunRow).not.toHaveBeenCalled();
    });

    it("G2 flag ON : CHAQUE marchand relu OK écrit sa ligne — MÊME un run 100 % sain (0 rejet est une donnée d'historique)", async () => {
        process.env.GOOGLE_FEED_RUNS_HISTORY = "1";
        summarizeProductStatuses.mockReturnValue(emptySummary({ total: 8, served: 8 }));
        fetchProcessedProducts.mockResolvedValue([{ id: "ok" }]);
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }], error: null },
        });

        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.feed_runs_written).toBe(1);
        expect(mockAdmin.current!.__upserts).toHaveLength(1);
        const up = mockAdmin.current!.__upserts[0];
        expect(up.table).toBe("google_feed_runs");
        expect(up.payload.merchant_id).toBe(MERCHANT_ID);
        expect(up.payload.total).toBe(8);
        expect(up.payload.served).toBe(8);
        // Upsert (merchant_id, day) : un re-run du même jour REMPLACE la ligne, jamais de doublon.
        expect(up.opts).toEqual({ onConflict: "merchant_id,day" });
    });

    it("G2 flag ON : échec d'upsert (ex. migration 114 absente) → captureError step feed-run-write, marchand PAS en erreur, run intact", async () => {
        process.env.GOOGLE_FEED_RUNS_HISTORY = "1";
        summarizeProductStatuses.mockReturnValue(emptySummary({ total: 3, served: 3 }));
        fetchProcessedProducts.mockResolvedValue([{ id: "ok" }]);
        mockAdmin.current = makeReadClient({
            google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }], error: null },
            google_feed_runs: { rows: [], error: null, upsertError: { message: 'relation "google_feed_runs" does not exist' } },
        });

        const { captureError } = await import("@/lib/error");
        const { POST } = await import("@/app/api/cron/google-status/route");
        const res = await POST(authedReq());
        const body = await res.json();

        // La persistance secondaire ne casse NI le marchand NI le run : statut honnête,
        // per_merchant intact, l'échec est VISIBLE (Sentry) au lieu d'un jour manquant muet.
        expect(res.status).toBe(200);
        expect(body.errors).toBe(0);
        expect(body.feed_runs_written).toBe(0);
        expect(body.per_merchant).toHaveLength(1);
        const calls = vi.mocked(captureError).mock.calls.map((c) => (c[1] as { step?: string })?.step);
        expect(calls).toContain("feed-run-write");
    });
});

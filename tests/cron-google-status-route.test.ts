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
type TableData = { rows: Row[]; error: { message: string } | null; insertError?: { message: string } | null };

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
            insert: (payload: Row) => {
                if (td.insertError) return Promise.resolve({ data: null, error: td.insertError });
                writes.push({ table, payload });
                return Promise.resolve({ data: null, error: null });
            },
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

const getGoogleAccessToken = vi.fn();
vi.mock("@/lib/google/merchant", () => ({
    getGoogleAccessToken: (...args: unknown[]) => getGoogleAccessToken(...args),
}));

const fetchProcessedProducts = vi.fn();
const summarizeProductStatuses = vi.fn();
const buildDisapprovalAlerts = vi.fn(() => []);
vi.mock("@/lib/google/product-status", () => ({
    fetchProcessedProducts: (...a: unknown[]) => fetchProcessedProducts(...a),
    summarizeProductStatuses: (...a: unknown[]) => summarizeProductStatuses(...a),
    buildDisapprovalAlerts: (...a: unknown[]) => buildDisapprovalAlerts(...a),
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
});

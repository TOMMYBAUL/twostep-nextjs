import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * G2 — GET /api/google/feed-runs : historique feed-quality du marchand connecté
 * (served/pending/disapproved/top_issues par run, écrit par le cron `google-status`).
 *
 * Propriété testée = l'HONNÊTETÉ des états (north-star / Phase E), même contrat que
 * sla-history : trois situations radicalement différentes ne se confondent JAMAIS :
 *  - migration 114 pas appliquée (table absente, 42P01/PGRST205) → 200 `available:false`
 *    (déploiement gated NORMAL — pas de Sentry, pas un 500, pas un « historique vide ») ;
 *  - vraie erreur DB → 500 + captureError (jamais un faux « aucun historique ») ;
 *  - table présente, 0 ligne → 200 `available:true, runs:[]` (vide RÉEL).
 */

type Row = Record<string, unknown>;
type TableState = { rows: Row[]; error: { code?: string; message: string } | null };

const h = {
    user: null as { id: string } | null,
    merchants: { rows: [], error: null } as TableState,
    runs: { rows: [], error: null } as TableState,
    runsOrder: null as { col: string; ascending?: boolean } | null,
    runsLimit: null as number | null,
    runsEq: {} as Record<string, unknown>,
};

function makeServerClient() {
    function builder(table: string) {
        const eq: Record<string, unknown> = {};
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = (col: string, val: unknown) => {
            eq[col] = val;
            if (table === "google_feed_runs") h.runsEq[col] = val;
            return b;
        };
        b.order = (col: string, opts?: { ascending?: boolean }) => {
            if (table === "google_feed_runs") h.runsOrder = { col, ascending: opts?.ascending };
            return b;
        };
        b.limit = (n: number) => {
            if (table === "google_feed_runs") h.runsLimit = n;
            return b;
        };
        b.single = () => {
            if (h.merchants.error) return Promise.resolve({ data: null, error: h.merchants.error });
            const row = h.merchants.rows.find((r) => r.user_id === eq.user_id) ?? null;
            return Promise.resolve({
                data: row,
                error: row ? null : { code: "PGRST116", message: "no rows" },
            });
        };
        b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
            if (h.runs.error) return Promise.resolve({ data: null, error: h.runs.error }).then(ok, err);
            return Promise.resolve({ data: h.runs.rows, error: null }).then(ok, err);
        };
        return b;
    }
    return {
        auth: { getUser: () => Promise.resolve({ data: { user: h.user } }) },
        from: (table: string) => builder(table),
    };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeServerClient() }));
vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));
import { captureError } from "@/lib/error";
const mockCapture = vi.mocked(captureError);

async function run() {
    const { GET } = await import("@/app/api/google/feed-runs/route");
    const res = await GET();
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const RUN_ROW: Row = {
    day: "2026-07-11",
    run_at: "2026-07-11T06:00:23.000Z",
    total: 10,
    served: 7,
    pending: 1,
    disapproved: 2,
    unknown: 0,
    top_issues: [{ code: "image_link_problem", severity: "DISAPPROVED", description: "Image inaccessible", count: 2 }],
};

describe("GET /api/google/feed-runs — états honnêtes", () => {
    beforeEach(() => {
        h.user = { id: "u-1" };
        h.merchants = { rows: [{ id: "m-1", user_id: "u-1" }], error: null };
        h.runs = { rows: [], error: null };
        h.runsOrder = null;
        h.runsLimit = null;
        h.runsEq = {};
        vi.clearAllMocks();
    });

    it("non authentifié → 401", async () => {
        h.user = null;
        const { status } = await run();
        expect(status).toBe(401);
    });

    it("pas de profil marchand (PGRST116) → 403", async () => {
        h.merchants.rows = [];
        const { status } = await run();
        expect(status).toBe(403);
    });

    it("erreur DB sur la lecture marchand (≠ PGRST116) → 500, jamais un faux 403", async () => {
        h.merchants.error = { code: "57014", message: "timeout" };
        const { status, body } = await run();
        expect(status).toBe(500);
        expect(body.error).toBe("db_error");
        expect(mockCapture).toHaveBeenCalled();
    });

    it("table absente 42P01 (migration 114 non appliquée) → 200 available:false, SANS Sentry", async () => {
        h.runs.error = { code: "42P01", message: 'relation "google_feed_runs" does not exist' };
        const { status, body } = await run();
        expect(status).toBe(200);
        expect(body).toEqual({ available: false, runs: [] });
        // État ATTENDU du déploiement gated → pas de bruit Sentry quotidien jusqu'au GO.
        expect(mockCapture).not.toHaveBeenCalled();
    });

    it("table hors schema cache PGRST205 → 200 available:false (même sémantique)", async () => {
        h.runs.error = { code: "PGRST205", message: "Could not find the table" };
        const { status, body } = await run();
        expect(status).toBe(200);
        expect(body).toEqual({ available: false, runs: [] });
    });

    it("vraie erreur DB sur l'historique → 500 + Sentry (JAMAIS déguisée en « pas d'historique »)", async () => {
        h.runs.error = { code: "57014", message: "statement timeout" };
        const { status, body } = await run();
        expect(status).toBe(500);
        expect(body.error).toBe("db_error");
        expect(mockCapture).toHaveBeenCalled();
    });

    it("table présente, 0 ligne → 200 available:true + runs:[] (vide RÉEL, distinct de gated)", async () => {
        const { status, body } = await run();
        expect(status).toBe(200);
        expect(body).toEqual({ available: true, runs: [] });
    });

    it("lignes présentes → 200, scopé au marchand, ordre desc, lecture bornée (limit 30)", async () => {
        h.runs.rows = [RUN_ROW];
        const { status, body } = await run();
        expect(status).toBe(200);
        expect(body.available).toBe(true);
        expect(body.runs).toEqual([RUN_ROW]);
        // Scope RLS doublé d'un .eq explicite + lecture bornée par construction (30 runs max).
        expect(h.runsEq.merchant_id).toBe("m-1");
        expect(h.runsOrder).toEqual({ col: "day", ascending: false });
        expect(h.runsLimit).toBe(30);
    });
});

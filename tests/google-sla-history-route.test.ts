import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * G1 — GET /api/google/sla-history : historique quotidien du SLA du marchand connecté.
 *
 * Propriété testée = l'HONNÊTETÉ des états (north-star / Phase E) : trois situations
 * radicalement différentes ne doivent JAMAIS se confondre dans la réponse :
 *  - migration 113 pas appliquée (table absente, 42P01/PGRST205) → 200 `available:false`
 *    (déploiement gated NORMAL — pas de Sentry, pas un 500, pas un « historique vide ») ;
 *  - vraie erreur DB → 500 + captureError (jamais un faux « aucun historique ») ;
 *  - table présente, 0 ligne → 200 `available:true, days:[]` (vide RÉEL).
 */

type Row = Record<string, unknown>;
type TableState = { rows: Row[]; error: { code?: string; message: string } | null };

const h = {
    user: null as { id: string } | null,
    merchants: { rows: [], error: null } as TableState,
    history: { rows: [], error: null } as TableState,
    historyOrder: null as { col: string; ascending?: boolean } | null,
    historyLimit: null as number | null,
    historyEq: {} as Record<string, unknown>,
};

function makeServerClient() {
    function builder(table: string) {
        const eq: Record<string, unknown> = {};
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = (col: string, val: unknown) => {
            eq[col] = val;
            if (table === "merchant_sla_history") h.historyEq[col] = val;
            return b;
        };
        b.order = (col: string, opts?: { ascending?: boolean }) => {
            if (table === "merchant_sla_history") h.historyOrder = { col, ascending: opts?.ascending };
            return b;
        };
        b.limit = (n: number) => {
            if (table === "merchant_sla_history") h.historyLimit = n;
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
            if (h.history.error) return Promise.resolve({ data: null, error: h.history.error }).then(ok, err);
            return Promise.resolve({ data: h.history.rows, error: null }).then(ok, err);
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
    const { GET } = await import("@/app/api/google/sla-history/route");
    const res = await GET();
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const DAY_ROW: Row = {
    day: "2026-07-10",
    total: 10,
    publishable: 8,
    publishable_score: 80,
    in_stock: 7,
    publishable_in_stock: 6,
    fresh_available: 4,
    freshness_score: 67,
};

describe("GET /api/google/sla-history — états honnêtes", () => {
    beforeEach(() => {
        h.user = { id: "u-1" };
        h.merchants = { rows: [{ id: "m-1", user_id: "u-1" }], error: null };
        h.history = { rows: [], error: null };
        h.historyOrder = null;
        h.historyLimit = null;
        h.historyEq = {};
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

    it("table absente 42P01 (migration 113 non appliquée) → 200 available:false, SANS Sentry", async () => {
        h.history.error = { code: "42P01", message: 'relation "merchant_sla_history" does not exist' };
        const { status, body } = await run();
        expect(status).toBe(200);
        expect(body).toEqual({ available: false, days: [] });
        // État ATTENDU du déploiement gated → pas de bruit Sentry quotidien jusqu'au GO.
        expect(mockCapture).not.toHaveBeenCalled();
    });

    it("table hors schema cache PGRST205 → 200 available:false (même sémantique)", async () => {
        h.history.error = { code: "PGRST205", message: "Could not find the table" };
        const { status, body } = await run();
        expect(status).toBe(200);
        expect(body).toEqual({ available: false, days: [] });
    });

    it("vraie erreur DB sur l'historique → 500 + Sentry (JAMAIS déguisée en « pas d'historique »)", async () => {
        h.history.error = { code: "57014", message: "statement timeout" };
        const { status, body } = await run();
        expect(status).toBe(500);
        expect(body.error).toBe("db_error");
        expect(mockCapture).toHaveBeenCalled();
    });

    it("table présente, 0 ligne → 200 available:true + days:[] (vide RÉEL, distinct de gated)", async () => {
        const { status, body } = await run();
        expect(status).toBe(200);
        expect(body).toEqual({ available: true, days: [] });
    });

    it("lignes présentes → 200, scopé au marchand, ordre desc, lecture bornée (limit 30)", async () => {
        h.history.rows = [DAY_ROW];
        const { status, body } = await run();
        expect(status).toBe(200);
        expect(body.available).toBe(true);
        expect(body.days).toEqual([DAY_ROW]);
        // Scope RLS doublé d'un .eq explicite + lecture bornée par construction (30 jours max).
        expect(h.historyEq.merchant_id).toBe("m-1");
        expect(h.historyOrder).toEqual({ col: "day", ascending: false });
        expect(h.historyLimit).toBe(30);
    });
});

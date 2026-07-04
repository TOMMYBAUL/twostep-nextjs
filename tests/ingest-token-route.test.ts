import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ONBOARDING self-serve pilote — route handler `GET/POST /api/ingest/token`.
 *
 * North-star §1 pilier 1 + cap item 2 : le marchand SANS caisse récupère ici le jeton
 * qui authentifie ses push de fichier stock (canal « feed LFP as a service »). C'est un
 * maillon du chemin pilote (M9) que la SPEC nomme explicitement comme TROU DE PREUVE
 * (« ingest/token : aucun test dédié »). On verrouille son contrat + on ferme deux faux
 * positifs d'affichage de la classe E5 :
 *
 *  (1) `getMerchantId` faisait `const { data: merchant } = …single()` en JETANT l'`error`.
 *      Un blip DB (≠ 0-ligne) → merchant=null → 401 « Unauthorized » servi à un marchand
 *      DÉJÀ onboardé sur son propre écran de jeton = éjection silencieuse (classe E5 :
 *      un blip ne doit jamais faire passer un marchand pour « pas marchand »). La vraie
 *      absence de marchand (`PGRST116` de `.single()`) reste un 401 légitime.
 *  (2) La lecture de l'historique (`last_used_at/rows/status`) jetait aussi son `error` :
 *      un blip masquait la fraîcheur du dernier push (« jamais poussé » trompeur). Non
 *      fatal (le jeton, payload PRIMAIRE, doit sortir) mais rendu VISIBLE (captureError).
 *
 * On drive le VRAI route handler ; seules les réponses DB ({data,error}) sont contrôlées.
 */

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

// ─── Faux client SESSION (auth + lookup merchant) ───────────────────────────
let authUser: { id: string } | null = { id: "user-1" };
// Réponse de `merchants.select().eq().single()` : { data, error } contrôlable.
let merchantResponse: { data: unknown; error: unknown } = { data: { id: "merch-1" }, error: null };

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: authUser } }) },
        from: (table: string) => {
            if (table !== "merchants") throw new Error(`unexpected session table ${table}`);
            return {
                select: () => ({ eq: () => ({ single: async () => merchantResponse }) }),
            };
        },
    }),
}));

// ─── Faux ADMIN (service_role) : ingest_credentials — token + historique ─────
// getOrCreateIngestToken lit `.select("token").eq().maybeSingle()` puis INSÈRE si absent.
// rotateIngestToken fait un `.upsert(...)`. La route relit ensuite l'historique.
let tokenRow: { data: unknown; error: unknown } = { data: { token: "existing-token" }, error: null };
let insertResult: { error: unknown } = { error: null };
let upsertResult: { error: unknown } = { error: null };
let historyResponse: { data: unknown; error: unknown } = {
    data: { last_used_at: "2026-07-01T10:00:00Z", last_rows: 42, last_status: "ok" },
    error: null,
};
const inserts: Array<Record<string, unknown>> = [];
const upserts: Array<Record<string, unknown>> = [];
// Distingue les 2 SELECT sur ingest_credentials : le 1er (token) vs le 2e (historique).
let selectCallCount = 0;
let lastSelectCols = "";

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            if (table !== "ingest_credentials") throw new Error(`unexpected admin table ${table}`);
            return {
                select: (cols: string) => {
                    selectCallCount++;
                    lastSelectCols = cols;
                    const isHistory = cols.includes("last_used_at");
                    return {
                        eq: () => ({
                            maybeSingle: async () => (isHistory ? historyResponse : tokenRow),
                        }),
                    };
                },
                insert: async (row: Record<string, unknown>) => {
                    inserts.push(row);
                    return insertResult;
                },
                upsert: async (row: Record<string, unknown>) => {
                    upserts.push(row);
                    return upsertResult;
                },
            };
        },
    }),
}));

import { GET, POST } from "@/app/api/ingest/token/route";

beforeEach(() => {
    captureMock.mockClear();
    authUser = { id: "user-1" };
    merchantResponse = { data: { id: "merch-1" }, error: null };
    tokenRow = { data: { token: "existing-token" }, error: null };
    insertResult = { error: null };
    upsertResult = { error: null };
    historyResponse = {
        data: { last_used_at: "2026-07-01T10:00:00Z", last_rows: 42, last_status: "ok" },
        error: null,
    };
    inserts.length = 0;
    upserts.length = 0;
    selectCallCount = 0;
    lastSelectCols = "";
    delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("GET /api/ingest/token", () => {
    it("renvoie le jeton existant + l'URL de push + l'exemple curl + l'historique", async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.token).toBe("existing-token");
        expect(body.push_url).toBe("https://twostep.fr/api/ingest/stock");
        expect(body.example_curl).toContain("Bearer existing-token");
        expect(body.example_curl).toContain("/api/ingest/stock");
        // historique surfacé pour la fraîcheur du dernier push (M9 invariant 6)
        expect(body.last_used_at).toBe("2026-07-01T10:00:00Z");
        expect(body.last_rows).toBe(42);
        expect(body.last_status).toBe("ok");
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("crée le jeton À LA VOLÉE si le marchand n'en a pas encore", async () => {
        tokenRow = { data: null, error: null }; // pas de ligne → création
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(inserts).toHaveLength(1);
        expect(inserts[0].merchant_id).toBe("merch-1");
        expect(typeof inserts[0].token).toBe("string");
        expect((inserts[0].token as string).length).toBeGreaterThanOrEqual(32);
        expect(body.token).toBe(inserts[0].token);
    });

    it("honore NEXT_PUBLIC_SITE_URL pour l'URL de push", async () => {
        process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
        const res = await GET();
        const body = await res.json();
        expect(body.push_url).toBe("https://app.example.com/api/ingest/stock");
    });

    it("401 quand il n'y a pas d'utilisateur en session", async () => {
        authUser = null;
        const res = await GET();
        expect(res.status).toBe(401);
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("401 LÉGITIME quand l'utilisateur n'est pas (encore) marchand (0 ligne = PGRST116)", async () => {
        // `.single()` sur 0 ligne renvoie data:null + error PGRST116 — ce n'est PAS un blip.
        merchantResponse = { data: null, error: { code: "PGRST116", message: "0 rows" } };
        const res = await GET();
        expect(res.status).toBe(401);
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("RÉGRESSION E5 : un blip DB sur le lookup marchand → 500, JAMAIS 401 (ne pas éjecter un marchand onboardé)", async () => {
        merchantResponse = { data: null, error: { code: "57014", message: "statement timeout" } };
        const res = await GET();
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
    });

    it("500 + captureError si la création du jeton échoue", async () => {
        tokenRow = { data: null, error: null };
        insertResult = { error: { message: "insert failed" } };
        const res = await GET();
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
    });

    it("un blip sur l'historique NE fait PAS échouer la requête (le jeton sort) mais est SIGNALÉ (captureError)", async () => {
        historyResponse = { data: null, error: { message: "history read failed" } };
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        // le jeton (payload primaire) est toujours renvoyé
        expect(body.token).toBe("existing-token");
        // l'historique est absent (pas de faux « poussé il y a X ») et l'échec est visible
        expect(body.last_status).toBeUndefined();
        expect(captureMock).toHaveBeenCalled();
    });
});

describe("POST /api/ingest/token (rotation)", () => {
    it("régénère le jeton (upsert) et le renvoie", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(upserts).toHaveLength(1);
        expect(upserts[0].merchant_id).toBe("merch-1");
        expect(typeof upserts[0].token).toBe("string");
        expect(body.token).toBe(upserts[0].token);
        // rotation = nouveau secret, différent de l'ancien
        expect(body.token).not.toBe("existing-token");
    });

    it("401 quand pas de session", async () => {
        authUser = null;
        const res = await POST();
        expect(res.status).toBe(401);
    });

    it("RÉGRESSION E5 : un blip DB sur le lookup marchand → 500, jamais 401", async () => {
        merchantResponse = { data: null, error: { code: "57014", message: "timeout" } };
        const res = await POST();
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
    });

    it("500 + captureError si la rotation échoue", async () => {
        upsertResult = { error: { message: "upsert failed" } };
        const res = await POST();
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
    });
});

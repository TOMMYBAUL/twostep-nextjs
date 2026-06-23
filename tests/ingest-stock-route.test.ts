import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * HOT PATH sans-caisse — route handler `POST /api/ingest/stock`.
 *
 * North-star §1 pilier 1 : « capter le stock de N'IMPORTE QUELLE source — y compris
 * SANS caisse — sans rien oublier ». Le push de fichier par jeton EST le canal
 * « feed LFP as a service » pour les caisses françaises à API fermée (cf. positionnement).
 * Son cœur métier (`ingestStockFileForMerchant`) et la chaîne snapshot (maillons 1→8)
 * étaient prouvés, mais AUCUN test ne drivait le route handler de bout en bout — or c'est
 * lui qui porte le contrat critique : présence du jeton → rate-limit → RÉSOLUTION du jeton
 * → lecture du corps (multipart vs brut) → mapping de l'outcome vers le bon statut HTTP.
 *
 * On verrouille en particulier la perte silencieuse n°1 du canal : un blip DB sur la
 * résolution du jeton NE DOIT PAS être servi comme « jeton invalide » (401) — sinon la
 * caisse/cron du marchand croit son jeton révoqué et CESSE de pousser. Le test drive le
 * VRAI `resolveIngestToken` (admin mocké uniquement au niveau de la réponse DB) pour
 * prouver que la garde error≠vide est réellement câblée jusqu'à la réponse 500.
 */

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

// rate-limit : null = pas de limite (cas nominal) ; configurable par test.
let rateLimitResponse: Response | null = null;
vi.mock("@/lib/rate-limit", () => ({
    rateLimit: vi.fn(async () => rateLimitResponse),
}));

// Cœur métier mocké : on contrôle l'outcome retourné pour prouver le mapping HTTP.
const ingestCore = vi.fn();
vi.mock("@/lib/ingest/ingest-stock-file", () => ({
    ingestStockFileForMerchant: (...a: unknown[]) => ingestCore(...a),
}));

// Faux admin : seul `ingest_credentials.select().eq().maybeSingle()` est exercé
// (par le VRAI resolveIngestToken). Réponse {data,error} configurable par test.
let credResponse: { data: unknown; error: unknown } = { data: null, error: null };
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            if (table !== "ingest_credentials") throw new Error(`unexpected table ${table}`);
            return {
                select: () => ({
                    eq: () => ({ maybeSingle: async () => credResponse }),
                }),
            };
        },
    }),
}));

const VALID_TOKEN = "a".repeat(48); // 48 hex chars ≥ 32 → passe la garde de longueur

function rawRequest(token: string | null, body: Uint8Array, opts: { contentType?: string; filename?: string } = {}) {
    const url = new URL("http://localhost/api/ingest/stock");
    if (token) url.searchParams.set("token", token);
    if (opts.filename) url.searchParams.set("filename", opts.filename);
    const headers: Record<string, string> = {};
    if (opts.contentType) headers["content-type"] = opts.contentType;
    return new NextRequest(url.toString(), { method: "POST", body: body as BodyInit, headers });
}

/**
 * Requête multipart fabriquée à la main : on stube `formData()` pour exposer EXACTEMENT
 * l'interface que le route handler consomme (`get("file")` → File avec `.arrayBuffer()`/
 * `.name`). On évite ainsi le ré-parseur multipart d'undici (assertion d'instance `File`
 * en environnement de test) sans rien retirer à la couverture de la BRANCHE multipart du
 * handler — c'est sa logique (`includes("multipart/form-data")` → lire le champ file) qui
 * est testée, pas la désérialisation undici.
 */
function multipartRequest(token: string, file: File | null) {
    const form = new FormData();
    if (file) form.append("file", file);
    return {
        url: `http://localhost/api/ingest/stock?token=${token}`,
        headers: new Headers({ "content-type": "multipart/form-data; boundary=----x" }),
        formData: async () => form,
        arrayBuffer: async () => { throw new Error("arrayBuffer ne doit pas être lu en multipart"); },
    } as unknown as NextRequest;
}

async function loadPost() {
    return (await import("@/app/api/ingest/stock/route")).POST;
}

beforeEach(() => {
    vi.clearAllMocks();
    rateLimitResponse = null;
    credResponse = { data: { merchant_id: "merch-1" }, error: null };
});

describe("resolveIngestToken — garde error ≠ vide (perte silencieuse n°1)", () => {
    it("jeton trop court → null sans toucher la DB", async () => {
        const { resolveIngestToken } = await import("@/lib/ingest/token");
        const admin = { from: () => { throw new Error("DB ne doit pas être appelée"); } } as never;
        expect(await resolveIngestToken("short", admin)).toBeNull();
    });

    it("jeton inconnu (0 ligne, error:null) → null", async () => {
        const { resolveIngestToken } = await import("@/lib/ingest/token");
        const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } as never;
        expect(await resolveIngestToken(VALID_TOKEN, admin)).toBeNull();
    });

    it("blip DB → LÈVE (ne se fait PAS passer pour jeton inconnu)", async () => {
        const { resolveIngestToken } = await import("@/lib/ingest/token");
        const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "timeout" } }) }) }) }) } as never;
        await expect(resolveIngestToken(VALID_TOKEN, admin)).rejects.toThrow(/ingest token resolution failed/);
    });

    it("jeton valide → merchant_id", async () => {
        const { resolveIngestToken } = await import("@/lib/ingest/token");
        const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { merchant_id: "m9" }, error: null }) }) }) }) } as never;
        expect(await resolveIngestToken(VALID_TOKEN, admin)).toBe("m9");
    });
});

describe("POST /api/ingest/stock — authentification & contrat de réponse", () => {
    it("jeton absent → 401, cœur jamais appelé", async () => {
        const POST = await loadPost();
        const res = await POST(rawRequest(null, new Uint8Array([1, 2, 3])));
        expect(res.status).toBe(401);
        expect((await res.json()).error).toMatch(/Missing ingest token/);
        expect(ingestCore).not.toHaveBeenCalled();
    });

    it("rate-limit déclenché → la réponse du limiteur est renvoyée telle quelle, cœur non appelé", async () => {
        rateLimitResponse = new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
        const POST = await loadPost();
        const res = await POST(rawRequest(VALID_TOKEN, new Uint8Array([1])));
        expect(res.status).toBe(429);
        expect(ingestCore).not.toHaveBeenCalled();
    });

    it("jeton inconnu → 401 « Invalid », cœur jamais appelé", async () => {
        credResponse = { data: null, error: null };
        const POST = await loadPost();
        const res = await POST(rawRequest(VALID_TOKEN, new Uint8Array([1])));
        expect(res.status).toBe(401);
        expect((await res.json()).error).toMatch(/Invalid ingest token/);
        expect(ingestCore).not.toHaveBeenCalled();
    });

    it("RÉGRESSION north-star : blip DB sur la résolution → 500 (PAS 401) + captureError, cœur non appelé", async () => {
        credResponse = { data: null, error: { message: "connection reset" } };
        const POST = await loadPost();
        const res = await POST(rawRequest(VALID_TOKEN, new Uint8Array([1])));
        expect(res.status).toBe(500); // une caisse RÉESSAIE sur 500 ; un 401 la ferait abandonner = stock perdu
        expect(res.status).not.toBe(401);
        expect(captureMock).toHaveBeenCalled();
        expect(captureMock.mock.calls[0][1]).toMatchObject({ route: "ingest/stock" });
        expect(ingestCore).not.toHaveBeenCalled();
    });
});

describe("POST /api/ingest/stock — mapping outcome → statut HTTP", () => {
    const cases: Array<[ReturnType<typeof ingestCore> extends never ? never : Record<string, unknown>, number, RegExp | null]> = [
        [{ outcome: "empty" }, 400, /Empty file/],
        [{ outcome: "too_large" }, 413, /too large/i],
        [{ outcome: "not_spreadsheet" }, 415, /CSV\/XLSX/],
        [{ outcome: "unchanged" }, 200, null],
        [{ outcome: "locked" }, 429, /already in progress/],
        [{ outcome: "no_products" }, 400, /No products/],
        [{ outcome: "no_exploitable", triage: { gtin_lines: 0, sku_lines: 0, rejected_lines: 3 } }, 422, /No exploitable/],
    ];

    for (const [outcome, status, pattern] of cases) {
        it(`outcome=${(outcome as { outcome: string }).outcome} → ${status}`, async () => {
            ingestCore.mockResolvedValueOnce(outcome);
            const POST = await loadPost();
            const res = await POST(rawRequest(VALID_TOKEN, new Uint8Array([1])));
            expect(res.status).toBe(status);
            if (pattern) expect((await res.json()).error).toMatch(pattern);
        });
    }

    it("outcome=no_exploitable expose le triage (pourquoi rien n'a été retenu)", async () => {
        ingestCore.mockResolvedValueOnce({ outcome: "no_exploitable", triage: { gtin_lines: 0, sku_lines: 0, rejected_lines: 5 } });
        const POST = await loadPost();
        const res = await POST(rawRequest(VALID_TOKEN, new Uint8Array([1])));
        expect((await res.json()).triage).toMatchObject({ rejected_lines: 5 });
    });

    it("outcome=ingested → 200 avec status + champs du résultat aplatis", async () => {
        ingestCore.mockResolvedValueOnce({
            outcome: "ingested",
            status: "partial",
            result: { total_items: 12, stock_replaced: 10, errors: ["x"], triage: { rejected_lines: 2 } },
        });
        const POST = await loadPost();
        const res = await POST(rawRequest(VALID_TOKEN, new Uint8Array([1])));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toMatchObject({ ok: true, status: "partial", total_items: 12, stock_replaced: 10 });
    });

    it("cœur qui throw (DB down pendant le snapshot) → 500 + captureError, jamais un 200 silencieux", async () => {
        ingestCore.mockRejectedValueOnce(new Error("snapshot boom"));
        const POST = await loadPost();
        const res = await POST(rawRequest(VALID_TOKEN, new Uint8Array([1])));
        expect(res.status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
    });
});

describe("POST /api/ingest/stock — lecture du corps", () => {
    it("corps brut → buffer transmis intact + filename par défaut .csv", async () => {
        ingestCore.mockResolvedValueOnce({ outcome: "unchanged" });
        const POST = await loadPost();
        const body = new Uint8Array([65, 66, 67]); // "ABC"
        await POST(rawRequest(VALID_TOKEN, body, { contentType: "text/csv" }));
        const [, merchantId, buf, filename] = ingestCore.mock.calls[0];
        expect(merchantId).toBe("merch-1");
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect((buf as Buffer).equals(Buffer.from(body))).toBe(true);
        expect(filename).toBe("stock.csv");
    });

    it("content-type tableur sans nom → filename .xlsx", async () => {
        ingestCore.mockResolvedValueOnce({ outcome: "unchanged" });
        const POST = await loadPost();
        await POST(rawRequest(VALID_TOKEN, new Uint8Array([1]), { contentType: "application/vnd.ms-excel" }));
        expect(ingestCore.mock.calls[0][3]).toBe("stock.xlsx");
    });

    it("?filename= prime sur le défaut", async () => {
        ingestCore.mockResolvedValueOnce({ outcome: "unchanged" });
        const POST = await loadPost();
        await POST(rawRequest(VALID_TOKEN, new Uint8Array([1]), { contentType: "text/csv", filename: "export-clictill.csv" }));
        expect(ingestCore.mock.calls[0][3]).toBe("export-clictill.csv");
    });

    it("multipart/form-data → lit le champ 'file', transmet buffer + nom du fichier", async () => {
        ingestCore.mockResolvedValueOnce({ outcome: "unchanged" });
        const POST = await loadPost();
        const content = new Uint8Array([1, 2, 3, 4]);
        const req = multipartRequest(VALID_TOKEN, new File([content], "inventaire.csv", { type: "text/csv" }));
        await POST(req);
        const [, , buf, filename] = ingestCore.mock.calls[0];
        expect((buf as Buffer).equals(Buffer.from(content))).toBe(true);
        expect(filename).toBe("inventaire.csv");
    });

    it("multipart sans champ 'file' → 400", async () => {
        const POST = await loadPost();
        const req = multipartRequest(VALID_TOKEN, null);
        const res = await POST(req);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/No file in form-data/);
        expect(ingestCore).not.toHaveBeenCalled();
    });

    it("jeton en Authorization: Bearer accepté (canal machine)", async () => {
        ingestCore.mockResolvedValueOnce({ outcome: "unchanged" });
        const POST = await loadPost();
        const req = new NextRequest("http://localhost/api/ingest/stock", {
            method: "POST",
            body: new Uint8Array([1]) as BodyInit,
            headers: { authorization: `Bearer ${VALID_TOKEN}`, "content-type": "text/csv" },
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(ingestCore).toHaveBeenCalled();
    });
});

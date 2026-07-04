/**
 * C1 (2026-07-04) — Cache NÉGATIF des EAN introuvables.
 *
 * Fuite corrigée : un EAN introuvable sur les 4 sources n'écrivait RIEN dans
 * `ean_lookups` → le sélecteur d'enrichissement (canonical_name IS NULL) le
 * re-présentait à CHAQUE run du cron 2 h → 4 lookups externes + Serper + vision
 * re-payés indéfiniment pour le même échec.
 *
 * Verrous prouvés ici :
 *  1. marqueur `source='not_found'` FRAIS → lookupEan sort AVANT tout appel
 *     externe (0 fetch, 0 Serper) ;
 *  2. cascade en échec → le marqueur est ÉCRIT (name='' NOT NULL, normalized null
 *     → invisible de la recherche fuzzy 083) et Serper n'est tenté qu'UNE fois ;
 *  3. marqueur PÉRIMÉ (> TTL 30 j) → re-tentative légitime (les bases évoluent) ;
 *  4. selectProductsToEnrich EXCLUT les produits au marqueur frais (et
 *     fail-open sur erreur de lecture du cache négatif : rien d'exclu, visible).
 *
 * Zéro faux positif : le marqueur ne publie AUCUNE donnée produit — il ne fait
 * que bloquer les re-achats.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const searchProductImageMock = vi.fn(async () => null as string | null);
const captureErrorMock = vi.fn();

vi.mock("@/lib/images/serper", () => ({
    searchProductImage: (...args: unknown[]) => searchProductImageMock(...(args as [])),
}));
vi.mock("@/lib/images/jobs", () => ({ createImageJob: vi.fn(async () => undefined) }));
vi.mock("@/lib/enrichment/telemetry", () => ({
    logCacheHit: vi.fn(async () => undefined),
    logCacheMiss: vi.fn(),
}));
vi.mock("@/lib/enrichment/cache-photo-r2", () => ({ uploadPhotoToR2: vi.fn(async () => undefined) }));
vi.mock("@/lib/error", () => ({ captureError: (...args: unknown[]) => captureErrorMock(...args) }));

// ── Fake Supabase admin client (table-driven, enregistre chaque requête) ──

type Query = {
    table: string;
    op: string;
    payload?: unknown;
    calls: Array<[string, unknown[]]>;
    single: boolean;
};

type Responder = (q: Query) => { data?: unknown; error?: unknown } | undefined;

const state: { respond: Responder; queries: Query[] } = {
    respond: () => ({ data: null, error: null }),
    queries: [],
};

function makeBuilder(q: Query) {
    const b: any = new Proxy(
        {},
        {
            get(_t, prop: string) {
                if (prop === "then") {
                    const p = Promise.resolve(state.respond(q) ?? { data: null, error: null });
                    return p.then.bind(p);
                }
                if (prop === "single" || prop === "maybeSingle") {
                    return () => {
                        q.single = true;
                        return Promise.resolve(state.respond(q) ?? { data: null, error: null });
                    };
                }
                return (...args: unknown[]) => {
                    if (prop === "update" || prop === "upsert" || prop === "insert") {
                        q.op = prop;
                        q.payload = args[0];
                    }
                    q.calls.push([prop, args]);
                    return b;
                };
            },
        },
    );
    return b;
}

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from(table: string) {
            const q: Query = { table, op: "select", calls: [], single: false };
            state.queries.push(q);
            return makeBuilder(q);
        },
        rpc(name: string, params?: unknown) {
            const q: Query = { table: `rpc:${name}`, op: "rpc", payload: params, calls: [], single: false };
            state.queries.push(q);
            return Promise.resolve(state.respond(q) ?? { data: null, error: null });
        },
    }),
}));

import {
    lookupEan,
    isFreshNotFound,
    EAN_NOT_FOUND_SOURCE,
    EAN_NOT_FOUND_TTL_MS,
} from "@/lib/ean/lookup";
import { selectProductsToEnrich } from "@/lib/ean/enrich";

const EAN = "3401579802345"; // 13 chiffres valides pour la regex de lookupEan

const originalFetch = globalThis.fetch;
const ORIG_ENV = {
    EAN_SEARCH_API_TOKEN: process.env.EAN_SEARCH_API_TOKEN,
    UPCITEMDB_API_KEY: process.env.UPCITEMDB_API_KEY,
};

function freshMarker() {
    return {
        ean: EAN,
        name: "",
        source: EAN_NOT_FOUND_SOURCE,
        fetched_at: new Date(Date.now() - 60_000).toISOString(), // il y a 1 min
    };
}

function staleMarker() {
    return {
        ean: EAN,
        name: "",
        source: EAN_NOT_FOUND_SOURCE,
        fetched_at: new Date(Date.now() - EAN_NOT_FOUND_TTL_MS - 60_000).toISOString(), // TTL + 1 min
    };
}

beforeEach(() => {
    state.queries = [];
    state.respond = () => ({ data: null, error: null });
    searchProductImageMock.mockClear();
    captureErrorMock.mockClear();
    // Sources externes désactivées côté clés → seuls les endpoints keyless fetchent,
    // tous mockés en échec (le test ne sort jamais sur le réseau).
    delete process.env.EAN_SEARCH_API_TOKEN;
    delete process.env.UPCITEMDB_API_KEY;
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 })) as never;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(ORIG_ENV)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
});

describe("isFreshNotFound (helper pur)", () => {
    it("marqueur < TTL → frais ; > TTL → périmé", () => {
        expect(isFreshNotFound(freshMarker())).toBe(true);
        expect(isFreshNotFound(staleMarker())).toBe(false);
    });

    it("ligne positive (source ≠ not_found) → jamais « frais négatif »", () => {
        expect(isFreshNotFound({ source: "ean_search", fetched_at: new Date().toISOString() })).toBe(false);
    });

    it("fetched_at absent/illisible → PÉRIMÉ (on re-tente, coverage > économie ; la re-tentative ré-écrit une date)", () => {
        expect(isFreshNotFound({ source: EAN_NOT_FOUND_SOURCE, fetched_at: null })).toBe(false);
        expect(isFreshNotFound({ source: EAN_NOT_FOUND_SOURCE, fetched_at: "pas-une-date" })).toBe(false);
    });
});

describe("lookupEan — marqueur négatif", () => {
    it("🔴→🟢 marqueur FRAIS → return false SANS AUCUN appel externe (ni sources EAN, ni Serper, ni write produit)", async () => {
        state.respond = (q) => {
            if (q.table === "ean_lookups" && q.op === "select") return { data: freshMarker(), error: null };
            return { data: null, error: null };
        };

        const result = await lookupEan(EAN, "prod-1");

        expect(result).toBe(false);
        // 0 appel réseau : ancien code = 4 cascades de sources + Serper à CHAQUE run.
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(searchProductImageMock).not.toHaveBeenCalled();
        // Aucune écriture : ni produits, ni rafraîchissement du marqueur.
        expect(state.queries.filter((q) => q.op !== "select")).toHaveLength(0);
    });

    it("🔴→🟢 cascade introuvable → ÉCRIT le marqueur not_found (name='', normalized=null) + UNE seule tentative Serper", async () => {
        state.respond = (q) => {
            if (q.table === "ean_lookups" && q.op === "select") return { data: null, error: { code: "PGRST116" } };
            if (q.table === "products" && q.op === "select") {
                return {
                    data: { merchant_id: "m1", photo_url: null, name: "Produit Mystère", brand: null, sku: null, category_id: null },
                    error: null,
                };
            }
            return { data: null, error: null };
        };

        const result = await lookupEan(EAN, "prod-1");

        expect(result).toBe(false);
        const upserts = state.queries.filter((q) => q.table === "ean_lookups" && q.op === "upsert");
        expect(upserts).toHaveLength(1);
        const payload = upserts[0].payload as Record<string, unknown>;
        expect(payload.source).toBe(EAN_NOT_FOUND_SOURCE);
        expect(payload.ean).toBe(EAN);
        expect(payload.name).toBe(""); // NOT NULL respecté, jamais publié comme nom
        expect(payload.canonical_name_normalized).toBeNull(); // invisible de la recherche fuzzy 083
        expect(typeof payload.fetched_at).toBe("string");
        // La tentative photo Serper de CE run reste permise (1 fois par fenêtre TTL)…
        expect(searchProductImageMock).toHaveBeenCalledTimes(1);
    });

    it("🔒 séquence réelle : 1er run = tentative complète + marqueur ; runs suivants = 0 appel externe", async () => {
        let markerRow: Record<string, unknown> | null = null;
        state.respond = (q) => {
            if (q.table === "ean_lookups" && q.op === "select") return { data: markerRow, error: markerRow ? null : { code: "PGRST116" } };
            if (q.table === "ean_lookups" && q.op === "upsert") {
                markerRow = q.payload as Record<string, unknown>;
                return { data: null, error: null };
            }
            if (q.table === "products" && q.op === "select") {
                return { data: { merchant_id: "m1", photo_url: null, name: "Produit Mystère", brand: null, sku: null, category_id: null }, error: null };
            }
            return { data: null, error: null };
        };

        await lookupEan(EAN, "prod-1"); // run 1 : cascade + marqueur
        const fetchCallsAfterRun1 = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
        const serperCallsAfterRun1 = searchProductImageMock.mock.calls.length;
        expect(serperCallsAfterRun1).toBe(1);

        const second = await lookupEan(EAN, "prod-1"); // run 2 (cron suivant)
        const third = await lookupEan(EAN, "prod-1"); // run 3

        expect(second).toBe(false);
        expect(third).toBe(false);
        // Plus AUCUN achat après le marqueur (ancien code : re-payait tout à chaque run).
        expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsAfterRun1);
        expect(searchProductImageMock.mock.calls.length).toBe(serperCallsAfterRun1);
    });

    it("marqueur PÉRIMÉ (> 30 j) → re-tentative complète (les bases EAN évoluent) + marqueur rafraîchi", async () => {
        state.respond = (q) => {
            if (q.table === "ean_lookups" && q.op === "select") return { data: staleMarker(), error: null };
            if (q.table === "products" && q.op === "select") {
                return { data: { merchant_id: "m1", photo_url: null, name: "Produit Mystère", brand: null, sku: null, category_id: null }, error: null };
            }
            return { data: null, error: null };
        };

        const result = await lookupEan(EAN, "prod-1");

        expect(result).toBe(false);
        // La cascade a bien re-tenté les sources keyless (fetch mocké en échec).
        expect(globalThis.fetch).toHaveBeenCalled();
        // Et le marqueur est rafraîchi (nouvelle fenêtre TTL).
        const upserts = state.queries.filter((q) => q.table === "ean_lookups" && q.op === "upsert");
        expect(upserts).toHaveLength(1);
        expect((upserts[0].payload as Record<string, unknown>).source).toBe(EAN_NOT_FOUND_SOURCE);
    });

    it("hit cache POSITIF inchangé → applique l'enrichissement sans appel externe", async () => {
        state.respond = (q) => {
            if (q.table === "ean_lookups" && q.op === "select") {
                return { data: { ean: EAN, name: "Nike Air Max 90", brand: "Nike", photo_url: "https://img/x.jpg", photo_url_r2: null, category: null, source: "ean_search", fetched_at: new Date().toISOString() }, error: null };
            }
            if (q.table === "products" && q.op === "select") {
                return { data: { merchant_id: "m1", photo_url: "https://deja.la/photo.jpg", name: "Nike Air Max 90", brand: "Nike", sku: null, category_id: null }, error: null };
            }
            return { data: null, error: null };
        };

        const result = await lookupEan(EAN, "prod-1");

        expect(result).toBe(true);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        // canonical_name écrit depuis le cache positif (comportement préservé).
        const updates = state.queries.filter((q) => q.table === "products" && q.op === "update");
        expect(updates).toHaveLength(1);
        expect((updates[0].payload as Record<string, unknown>).canonical_name).toBe("Nike Air Max 90");
    });
});

describe("selectProductsToEnrich — exclusion des not_found récents", () => {
    const page = [
        { id: "p1", ean: "1111111111116" },
        { id: "p2", ean: "2222222222222" },
        { id: "p3", ean: "3333333333338" },
    ];

    it("🔴→🟢 un produit dont l'EAN a un marqueur FRAIS est EXCLU ; les autres passent", async () => {
        state.respond = (q) => {
            if (q.table === "products") return { data: page, error: null };
            if (q.table === "ean_lookups") return { data: [{ ean: "1111111111116" }], error: null };
            return { data: null, error: null };
        };

        const result = await selectProductsToEnrich();

        expect(result.map((p) => p.id)).toEqual(["p2", "p3"]);
        // La lecture du cache négatif filtre bien source='not_found' + fenêtre TTL.
        const negQuery = state.queries.find((q) => q.table === "ean_lookups");
        expect(negQuery?.calls).toEqual(
            expect.arrayContaining([
                ["eq", ["source", EAN_NOT_FOUND_SOURCE]],
                expect.arrayContaining(["gte"]),
            ]),
        );
    });

    it("le limit s'applique APRÈS exclusion (pas de starvation : un bloqué ne consomme pas le quota)", async () => {
        state.respond = (q) => {
            if (q.table === "products") return { data: page, error: null };
            if (q.table === "ean_lookups") return { data: [{ ean: "1111111111116" }], error: null };
            return { data: null, error: null };
        };

        const result = await selectProductsToEnrich(undefined, 2);

        expect(result.map((p) => p.id)).toEqual(["p2", "p3"]);
    });

    it("fail-OPEN : lecture du cache négatif en erreur → rien d'exclu (le guard lookupEan bloque le spend) + visible Sentry", async () => {
        state.respond = (q) => {
            if (q.table === "products") return { data: page, error: null };
            if (q.table === "ean_lookups") return { data: null, error: { message: "blip" } };
            return { data: null, error: null };
        };

        const result = await selectProductsToEnrich();

        expect(result.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
        expect(captureErrorMock).toHaveBeenCalled();
    });

    it("comportement historique préservé : lecture produits en erreur → []", async () => {
        state.respond = (q) => {
            if (q.table === "products") return { data: null, error: { message: "down" } };
            return { data: null, error: null };
        };

        const result = await selectProductsToEnrich();

        expect(result).toEqual([]);
    });
});

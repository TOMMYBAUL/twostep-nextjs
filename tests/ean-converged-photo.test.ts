/**
 * Re-projection de la photo convergée sur le produit (fix 2026-07-09, P1 6a.2).
 *
 * Bug prouvé EN RÉEL sur le marchand démo « Maison Garonne » : `lookupEan`
 * applique la PREMIÈRE source de `fetchEanData` (EAN-Search en tête — photo
 * TOUJOURS null), puis la convergence P0-10 (`collectAllEanSources`) découvre
 * OBF/OPF (photo GTIN-keyée) et son write-back n'upgrade que le CACHE
 * `ean_lookups` → 19/19 produits enrichis avec photo présente au cache et
 * `products.photo_url` ∅. Un catalogue pilote sortirait de son premier
 * enrichissement SANS images.
 *
 * Verrous prouvés ici (vraie chaîne `applyConvergedCachedPhoto` → `applyEnrichment`) :
 *  1. cache avec photo + produit sans photo → photo appliquée (photo_source "ean") ;
 *  2. produit AYANT déjà une photo → jamais écrasée ;
 *  3. cache SANS photo → no-op total : AUCUNE lecture produit, AUCUN repli Serper
 *     (pas de double dépense — le premier applyEnrichment l'a déjà tenté) ;
 *  4. marqueur négatif not_found → no-op ;
 *  5. erreur de lecture cache → captureError + no-op, jamais de throw (le verdict
 *     de visibilité déjà écrit ne doit pas être perdu pour une photo) ;
 *  6. câblage worker : enrichOneProduct re-projette APRÈS la cascade (le test du
 *     bug réel : 1re source sans photo, cascade converge → produit AVEC photo).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchProductImageMock = vi.fn(async () => null as string | null);
const verifyPhotoMock = vi.fn(async () => true);
const captureErrorMock = vi.fn();

vi.mock("@/lib/images/serper", () => ({
    searchProductImage: (...args: unknown[]) => searchProductImageMock(...(args as [])),
    verifyPhotoWithAI: (...args: unknown[]) => verifyPhotoMock(...(args as [])),
}));
vi.mock("@/lib/images/jobs", () => ({ createImageJob: vi.fn(async () => undefined) }));
vi.mock("@/lib/enrichment/telemetry", () => ({
    logCacheHit: vi.fn(async () => undefined),
    logCacheMiss: vi.fn(),
}));
vi.mock("@/lib/enrichment/cache-photo-r2", () => ({ uploadPhotoToR2: vi.fn(async () => undefined) }));
vi.mock("@/lib/error", () => ({ captureError: (...args: unknown[]) => captureErrorMock(...args) }));

// ── Fake Supabase admin (motif ean-openfacts-image-verify : table-driven) ──
type Query = { table: string; op: string; payload?: unknown; calls: Array<[string, unknown[]]>; single: boolean };
type Responder = (q: Query) => { data?: unknown; error?: unknown } | undefined;

const state: { respond: Responder; queries: Query[] } = {
    respond: () => ({ data: null, error: null }),
    queries: [],
};

function makeBuilder(q: Query) {
    const b: any = new Proxy({}, {
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
    });
    return b;
}

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from(table: string) {
            const q: Query = { table, op: "select", calls: [], single: false };
            state.queries.push(q);
            return makeBuilder(q);
        },
    }),
}));

import { applyConvergedCachedPhoto } from "@/lib/ean/lookup";

const EAN = "3264680011016";
const OBF_PHOTO = "https://images.openbeautyfacts.org/images/products/326/468/001/1016/front_fr.10.400.jpg";

function cacheRow(overrides: Record<string, unknown> = {}) {
    return {
        ean: EAN,
        name: "Nuxe Huile Prodigieuse Multi Usage Dry Oil 100ml",
        brand: "Nuxe",
        photo_url: OBF_PHOTO,
        photo_url_r2: null,
        category: "beauty",
        source: "open_beauty_facts",
        fetched_at: new Date().toISOString(),
        ...overrides,
    };
}

function respondWith(opts: { cache?: Record<string, unknown> | null; cacheError?: unknown; prodPhoto?: string | null }) {
    state.respond = (q) => {
        if (q.table === "ean_lookups") {
            if (opts.cacheError) return { data: null, error: opts.cacheError };
            return { data: opts.cache === undefined ? cacheRow() : opts.cache, error: null };
        }
        if (q.table === "products" && q.op === "select") {
            return {
                data: {
                    merchant_id: "m-demo",
                    photo_url: opts.prodPhoto ?? null,
                    name: "Nuxe Huile prodigieuse 100 ml",
                    brand: null,
                    sku: "NUXE-HP100",
                    category_id: null,
                },
                error: null,
            };
        }
        return { data: null, error: null };
    };
}

function productReads() {
    return state.queries.filter((x) => x.table === "products" && x.op === "select");
}
function productUpdate() {
    const q = state.queries.find((x) => x.table === "products" && x.op === "update");
    return q ? (q.payload as Record<string, unknown>) : null;
}

beforeEach(() => {
    state.queries = [];
    state.respond = () => ({ data: null, error: null });
    searchProductImageMock.mockClear();
    searchProductImageMock.mockResolvedValue(null);
    verifyPhotoMock.mockClear();
    captureErrorMock.mockClear();
    delete process.env.VERIFY_OPEN_FACTS_IMAGES;
});

describe("applyConvergedCachedPhoto — la photo découverte par la convergence atteint le produit", () => {
    it("cache avec photo + produit sans photo → photo appliquée, photo_source 'ean' (le bug réel fermé)", async () => {
        respondWith({ prodPhoto: null });

        await applyConvergedCachedPhoto(EAN, "prod-1");

        const upd = productUpdate();
        expect(upd).toBeTruthy();
        expect(upd!.photo_url).toBe(OBF_PHOTO);
        expect(upd!.photo_source).toBe("ean");
    });

    it("préfère la photo R2 re-hostée quand présente", async () => {
        const r2 = "https://r2.twostep.fr/ean/3264680011016.jpg";
        respondWith({ cache: cacheRow({ photo_url_r2: r2 }), prodPhoto: null });

        await applyConvergedCachedPhoto(EAN, "prod-1");

        expect(productUpdate()!.photo_url).toBe(r2);
    });

    it("produit AYANT déjà une photo → jamais écrasée", async () => {
        respondWith({ prodPhoto: "https://existant.jpg" });

        await applyConvergedCachedPhoto(EAN, "prod-1");

        const upd = productUpdate();
        // applyEnrichment peut poser canonical_name/brand, mais JAMAIS la photo.
        if (upd) {
            expect(upd.photo_url).toBeUndefined();
            expect(upd.photo_source).toBeUndefined();
        }
    });

    it("cache SANS photo → no-op total : aucune lecture produit, aucun repli Serper (pas de double dépense)", async () => {
        respondWith({ cache: cacheRow({ photo_url: null, photo_url_r2: null }), prodPhoto: null });

        await applyConvergedCachedPhoto(EAN, "prod-1");

        expect(productReads()).toHaveLength(0);
        expect(searchProductImageMock).not.toHaveBeenCalled();
        expect(productUpdate()).toBeNull();
    });

    it("nom cache 'Unknown' : la photo s'applique, mais canonical_name n'est JAMAIS écrit avec 'Unknown'", async () => {
        respondWith({ cache: cacheRow({ name: "Unknown" }), prodPhoto: null });

        await applyConvergedCachedPhoto(EAN, "prod-1");

        const upd = productUpdate();
        expect(upd).toBeTruthy();
        expect(upd!.photo_url).toBe(OBF_PHOTO);
        expect(upd!.canonical_name).toBeUndefined();
    });

    it("marqueur négatif not_found → no-op", async () => {
        respondWith({ cache: cacheRow({ source: "not_found", name: "", photo_url: null }), prodPhoto: null });

        await applyConvergedCachedPhoto(EAN, "prod-1");

        expect(productReads()).toHaveLength(0);
        expect(productUpdate()).toBeNull();
    });

    it("cache absent (null) → no-op", async () => {
        respondWith({ cache: null, prodPhoto: null });

        await applyConvergedCachedPhoto(EAN, "prod-1");

        expect(productReads()).toHaveLength(0);
        expect(productUpdate()).toBeNull();
    });

    it("erreur de lecture cache → captureError + no-op, jamais de throw", async () => {
        respondWith({ cacheError: { code: "57014", message: "timeout" }, prodPhoto: null });

        await expect(applyConvergedCachedPhoto(EAN, "prod-1")).resolves.toBeUndefined();

        expect(captureErrorMock).toHaveBeenCalledTimes(1);
        expect(productReads()).toHaveLength(0);
        expect(productUpdate()).toBeNull();
    });
});

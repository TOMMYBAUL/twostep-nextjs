/**
 * Canonicalisation de la marque source — vitrine réelle 2026-07-09 (Maison Garonne).
 *
 * Trou prouvé en RÉEL (rapport `docs/prospection/vitrine-demo-2026-07-09.md`) : le champ
 * `brands` OBF/OPF arrive BRUT sur le produit via `applyEnrichment` —
 *   - « La Roche-Posay, loreal » (liste de tags à virgules écrite verbatim) ;
 *   - « WELEDA » (casse contributeur) ;
 *   - marque ∅ sur « L'Occitane Crème Mains Karité » (L'Occitane absente de l'allow-list).
 *
 * Verrous prouvés ici sur la VRAIE chaîne `lookupEan` cache-hit → `applyEnrichment`
 * (pas seulement le helper pur — LESSON : une garde en helper ne protège pas un chemin
 * qui ne la traverse pas) :
 *  1. liste à virgules → seul le tag primaire, casse canonique, atteint `products.brand` ;
 *  2. casse contributeur → casse canonique de l'allow-list ;
 *  3. marque source absente + nom résolu portant une marque nouvellement listée →
 *     récupération allow-list (la ligne « ∅ » du rapport devient récupérée).
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

import { lookupEan } from "@/lib/ean/lookup";

const EAN = "3337875696548";

/** Cache-hit ean_lookups (source OBF, marque pilotable) + produit pilotable. */
function respondWith(opts: { cachedBrand: string | null; cachedName: string; prodName: string; cachedCategory?: string | null }) {
    state.respond = (q) => {
        if (q.table === "ean_lookups") {
            return {
                data: {
                    ean: EAN,
                    name: opts.cachedName,
                    brand: opts.cachedBrand,
                    photo_url: null,
                    photo_url_r2: null,
                    category: opts.cachedCategory ?? null,
                    source: "open_beauty_facts",
                    fetched_at: new Date().toISOString(),
                },
                error: null,
            };
        }
        if (q.table === "products" && q.op === "select") {
            return {
                data: { merchant_id: "m-1", photo_url: null, name: opts.prodName, brand: null, sku: null, category_id: null },
                error: null,
            };
        }
        return { data: null, error: null };
    };
}

function productUpdate() {
    const q = state.queries.find((x) => x.table === "products" && x.op === "update");
    return q ? (q.payload as Record<string, unknown>) : null;
}

beforeEach(() => {
    state.queries = [];
    searchProductImageMock.mockClear();
    searchProductImageMock.mockResolvedValue(null);
    verifyPhotoMock.mockClear();
    captureErrorMock.mockClear();
});

describe("applyEnrichment — canonicalisation de la marque source (vraie chaîne)", () => {
    it("liste à virgules OBF « La Roche-Posay, loreal » → products.brand = « La Roche-Posay »", async () => {
        respondWith({
            cachedBrand: "La Roche-Posay, loreal",
            cachedName: "La Roche-Posay Lipikar Baume AP+M 400 ml",
            prodName: "La Roche-Posay Lipikar Baume AP+M 400 ml",
        });

        await lookupEan(EAN, "prod-1");

        const upd = productUpdate();
        expect(upd).toBeTruthy();
        expect(upd!.brand).toBe("La Roche-Posay");
    });

    it("casse contributeur « WELEDA » → casse canonique « Weleda »", async () => {
        respondWith({
            cachedBrand: "WELEDA",
            cachedName: "Weleda Déodorant roll-on 24h 50 ml",
            prodName: "Weleda Déodorant roll-on 24h 50 ml",
        });

        await lookupEan(EAN, "prod-1");

        const upd = productUpdate();
        expect(upd).toBeTruthy();
        expect(upd!.brand).toBe("Weleda");
    });

    it("marque source absente + nom « L'Occitane … » → récupération allow-list « L'Occitane » (la ligne ∅ du rapport)", async () => {
        respondWith({
            cachedBrand: null,
            cachedName: "L'Occitane Crème Mains Karité 150 ml",
            prodName: "L'Occitane Crème Mains Karité 150 ml",
        });

        await lookupEan(EAN, "prod-1");

        const upd = productUpdate();
        expect(upd).toBeTruthy();
        expect(upd!.brand).toBe("L'Occitane");
    });

    it("compromis DOCUMENTÉ (revue SF-hunter MED-1) : tag primaire inconnu incohérent → catégorie source retenue, marque RÉCUPÉRÉE propre via l'allow-list", async () => {
        // Avant le fix, « Innotech, Nivea » passait la garde de cohérence par COÏNCIDENCE
        // (le 2e tag « nivea » matchait le nom produit en substring de la chaîne brute) →
        // marque sale écrite verbatim + catégorie source conservée. Après canonicalisation,
        // seul le tag PRIMAIRE compte : « Innotech » ne colle pas au nom produit → tout
        // l'enregistrement source est suspect → sa catégorie est retenue (l'AI-categorize,
        // autoritaire, la remplira). La marque, elle, est RÉCUPÉRÉE par la voie maillon 9(c)
        // (allow-list sur le nom résolu GTIN-keyé) → « Nivea » propre au lieu de la chaîne
        // sale. Durcissement VOULU, pas une régression.
        respondWith({
            cachedBrand: "Innotech, Nivea",
            cachedName: "Nivea Creme Visage 50ml",
            prodName: "Nivea Creme Visage 50ml",
            cachedCategory: "beauty",
        });

        await lookupEan(EAN, "prod-1");

        const upd = productUpdate();
        expect(upd).toBeTruthy();
        expect(upd!.brand).toBe("Nivea"); // récupérée propre — jamais « Innotech, Nivea » verbatim
        expect(upd!.category).toBeUndefined(); // catégorie d'un enregistrement suspect : retenue
    });

    it("marque inconnue mono-tag : verbatim préservé (zéro invention, non-régression)", async () => {
        respondWith({
            cachedBrand: "Byredo",
            cachedName: "Byredo Gypsy Water EDP 50 ml",
            prodName: "Byredo Gypsy Water EDP 50 ml",
        });

        await lookupEan(EAN, "prod-1");

        const upd = productUpdate();
        expect(upd).toBeTruthy();
        expect(upd!.brand).toBe("Byredo");
    });
});

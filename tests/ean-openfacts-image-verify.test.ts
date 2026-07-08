/**
 * Garde vision des images Open Facts (OBF/OPF) — audit 2026-07-08, M3 HAUT.
 * GATED `VERIFY_OPEN_FACTS_IMAGES=1` (préparé 2026-07-09, GO Thomas en attente,
 * couplé à la décision #1 clé ANTHROPIC).
 *
 * Trou audité : `applyEnrichment` appliquait l'image EAN-source (OBF/OPF, seules
 * sources à renvoyer une photo) SANS `verifyPhotoWithAI` — seule la voie Serper
 * était vérifiée. Une photo de dos d'emballage, ou d'un AUTRE produit (barcode
 * reuse / fiche contribuée fausse), passait comme visuel produit publié.
 *
 * Verrous prouvés ici (lookupEan cache-hit → applyEnrichment, vraie chaîne) :
 *  1. flag OFF (défaut) → comportement 2026-06-28 BYTE-IDENTIQUE : image appliquée,
 *     0 appel vision (la décision reste chez Thomas, prod inchangée) ;
 *  2. flag ON + vision OK → image appliquée (photo_source "ean") ;
 *  3. flag ON + vision REJETTE → l'image OBF n'est JAMAIS écrite ; repli Serper
 *     tenté (lui-même vérifié en interne) ; Serper vide → AUCUNE écriture photo
 *     (pas d'image > fausse image) ;
 *  4. produit AYANT déjà une photo → 0 appel vision (pas de dépense pour un no-op).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// ── Fake Supabase admin (motif ean-negative-cache : table-driven) ──
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

const EAN = "3401579802345";
const OBF_PHOTO = "https://images.openfoodfacts.org/front_fr.4.full.jpg";

/** Cache-hit ean_lookups (source OBF avec photo) + produit pilotable. */
function respondWith(prod: { photo_url: string | null; name?: string }, cachedName = "Crème hydratante BioDerm 50ml") {
    state.respond = (q) => {
        if (q.table === "ean_lookups") {
            return {
                data: {
                    ean: EAN,
                    name: cachedName,
                    brand: "BioDerm",
                    photo_url: OBF_PHOTO,
                    photo_url_r2: null,
                    category: "beauty",
                    source: "open_beauty_facts",
                    fetched_at: new Date().toISOString(),
                },
                error: null,
            };
        }
        if (q.table === "products" && q.op === "select") {
            return {
                data: { merchant_id: "m-1", photo_url: prod.photo_url, name: prod.name ?? "Crème hydratante BioDerm", brand: null, sku: null, category_id: null },
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
    verifyPhotoMock.mockResolvedValue(true);
    captureErrorMock.mockClear();
    delete process.env.VERIFY_OPEN_FACTS_IMAGES;
});

afterEach(() => {
    delete process.env.VERIFY_OPEN_FACTS_IMAGES;
});

describe("applyEnrichment — garde vision des images Open Facts (GATED)", () => {
    it("flag OFF (défaut prod) : image OBF appliquée SANS vérif vision — byte-identique au comportement actuel", async () => {
        respondWith({ photo_url: null });

        await lookupEan(EAN, "prod-1");

        expect(verifyPhotoMock).not.toHaveBeenCalled();
        const upd = productUpdate();
        expect(upd).toBeTruthy();
        expect(upd!.photo_url).toBe(OBF_PHOTO);
        expect(upd!.photo_source).toBe("ean");
    });

    it("flag ON + vision OK : image OBF appliquée (photo_source 'ean')", async () => {
        process.env.VERIFY_OPEN_FACTS_IMAGES = "1";
        respondWith({ photo_url: null });
        verifyPhotoMock.mockResolvedValue(true);

        await lookupEan(EAN, "prod-1");

        expect(verifyPhotoMock).toHaveBeenCalledTimes(1);
        // Vérifiée contre le nom RÉSOLU (le plus riche) + la marque source.
        expect(verifyPhotoMock).toHaveBeenCalledWith(OBF_PHOTO, "Crème hydratante BioDerm 50ml", "BioDerm");
        const upd = productUpdate();
        expect(upd!.photo_url).toBe(OBF_PHOTO);
        expect(upd!.photo_source).toBe("ean");
    });

    it("flag ON + vision REJETTE : l'image OBF n'est JAMAIS écrite ; repli Serper tenté ; Serper vide → aucune écriture photo", async () => {
        process.env.VERIFY_OPEN_FACTS_IMAGES = "1";
        respondWith({ photo_url: null });
        verifyPhotoMock.mockResolvedValue(false);
        searchProductImageMock.mockResolvedValue(null);

        await lookupEan(EAN, "prod-1");

        // Le repli Serper (lui-même vérifié en interne) a bien été tenté.
        expect(searchProductImageMock).toHaveBeenCalledTimes(1);
        // Pas d'image > fausse image : le payload n'a AUCUN champ photo.
        const upd = productUpdate();
        expect(upd).toBeTruthy(); // name/brand/category s'écrivent quand même
        expect(upd!.photo_url).toBeUndefined();
        expect(upd!.photo_source).toBeUndefined();
        // Dégradation VISIBLE (revue SF-hunter HIGH) : chaque rejet est tracé par produit
        // (le produit ne sera pas re-tenté automatiquement → il faut le voir).
        const phases = captureErrorMock.mock.calls.map((c) => (c[1] as any)?.phase);
        expect(phases).toContain("openfacts-image-verify");
    });

    it("flag ON + AUCUN nom exploitable (résolu 'Unknown', produit '') : fail-closed SANS dépenser l'appel vision", async () => {
        process.env.VERIFY_OPEN_FACTS_IMAGES = "1";
        respondWith({ photo_url: null, name: "  " }, "Unknown");

        await lookupEan(EAN, "prod-1");

        // Aucune base de vérification → pas d'appel Haiku (0 dépense), image écartée.
        expect(verifyPhotoMock).not.toHaveBeenCalled();
        const upd = productUpdate();
        if (upd) {
            expect(upd.photo_url).not.toBe(OBF_PHOTO);
        }
        const phases = captureErrorMock.mock.calls.map((c) => (c[1] as any)?.phase);
        expect(phases).toContain("openfacts-image-verify");
    });

    it("flag ON + vision rejette + Serper trouve : l'image publiée est celle de Serper (déjà vérifiée), pas l'OBF rejetée", async () => {
        process.env.VERIFY_OPEN_FACTS_IMAGES = "1";
        respondWith({ photo_url: null });
        verifyPhotoMock.mockResolvedValue(false);
        searchProductImageMock.mockResolvedValue("https://serper.example/ok.jpg");

        await lookupEan(EAN, "prod-1");

        const upd = productUpdate();
        expect(upd!.photo_url).toBe("https://serper.example/ok.jpg");
        expect(upd!.photo_source).toBe("serper");
    });

    it("flag ON mais produit AYANT déjà une photo : 0 appel vision (pas de dépense pour un no-op)", async () => {
        process.env.VERIFY_OPEN_FACTS_IMAGES = "1";
        respondWith({ photo_url: "https://existing.example/photo.jpg" });

        await lookupEan(EAN, "prod-1");

        expect(verifyPhotoMock).not.toHaveBeenCalled();
        expect(searchProductImageMock).not.toHaveBeenCalled();
        const upd = productUpdate();
        // La photo existante n'est jamais écrasée (comportement historique préservé).
        if (upd) {
            expect(upd.photo_url).toBeUndefined();
        }
    });
});

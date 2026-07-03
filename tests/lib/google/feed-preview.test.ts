import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    classifyFeedRow,
    isFeedEligible,
    type FeedEligibleRow,
} from "@/lib/google/feed-eligibility";
import { resolveStoreCode } from "@/lib/google/store-code";

/**
 * Mode SHADOW/PREVIEW du feed Google LFP (item onboarding pilote — `docs/autonomy-priorities.md`
 * §1bis filtre de cap, item 2 : « mode shadow/preview, montrer avant de publier, lecture-seule »).
 *
 * North-star : un pilote (Deerskin…) doit pouvoir inspecter EXACTEMENT ce qu'on publierait sur
 * Google AVANT de publier — sinon il découvre un catalogue fantôme après coup (ce qui a tué
 * MVMS/Milo). La propriété cruciale = PARITÉ : le preview réutilise le MÊME gate + transform +
 * population + store_code que les 2 feeds live → il ne peut pas mentir.
 *
 * Méthode §1bis : (1) verrou de parité `classifyFeedRow` ⟺ `isFeedEligible` (anti-divergence) ;
 * (2) CHEMIN RÉEL de la route, payload Google inspecté champ par champ + gardes silent-failure.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. classifyFeedRow (pure) — parité STRICTE avec isFeedEligible + causes par produit
// ─────────────────────────────────────────────────────────────────────────────
describe("feed-preview — classifyFeedRow (pure, parité gate + causes)", () => {
    const r = (p: Partial<FeedEligibleRow>): FeedEligibleRow => ({
        ean: "0884776073143",
        price: 129.99,
        photo_url: "https://cdn/x.jpg",
        photo_processed_url: null,
        ...p,
    });

    // Batterie SALE couvrant chaque combinaison de cause.
    const battery: FeedEligibleRow[] = [
        r({}), // publiable
        r({ ean: "3601234567890", photo_url: null, photo_processed_url: "https://r2/y.webp" }), // image traitée
        r({ ean: null }), // pas d'EAN
        r({ ean: "1234" }), // EAN tronqué (<8)
        r({ price: 0 }), // prix 0
        r({ price: null }), // prix null
        r({ photo_url: null, photo_processed_url: null }), // sans image
        r({ photo_url: "", photo_processed_url: "" }), // image "" (back-fill) = pas une image
        r({ ean: null, price: null, photo_url: null, photo_processed_url: null }), // tout KO
    ];

    it("eligible ⟺ isFeedEligible, dans les DEUX états du flag (anti-divergence preview↔feed)", () => {
        for (const opts of [{}, { allowMissingImage: true }, { allowMissingImage: false }]) {
            for (const row of battery) {
                expect(classifyFeedRow(row, opts).eligible).toBe(isFeedEligible(row, opts));
            }
        }
    });

    it("liste les causes exactes par produit (ordre stable ean → prix → image)", () => {
        expect(classifyFeedRow(r({})).reasons).toEqual([]);
        expect(classifyFeedRow(r({ ean: null })).reasons).toEqual(["missing_ean"]);
        expect(classifyFeedRow(r({ ean: "1234" })).reasons).toEqual(["missing_ean"]);
        expect(classifyFeedRow(r({ price: 0 })).reasons).toEqual(["missing_price"]);
        expect(classifyFeedRow(r({ photo_url: null, photo_processed_url: null })).reasons).toEqual(["missing_image"]);
        expect(classifyFeedRow(r({ photo_url: "", photo_processed_url: "" })).reasons).toEqual(["missing_image"]);
        // cumul : ordre stable
        expect(
            classifyFeedRow(r({ ean: null, price: null, photo_url: null, photo_processed_url: null })).reasons,
        ).toEqual(["missing_ean", "missing_price", "missing_image"]);
    });

    it("tier GTIN-only (allowMissingImage): l'image n'est PLUS une cause de blocage", () => {
        const noImage = r({ photo_url: null, photo_processed_url: null });
        expect(classifyFeedRow(noImage, { allowMissingImage: false }).reasons).toEqual(["missing_image"]);
        expect(classifyFeedRow(noImage, { allowMissingImage: true }).eligible).toBe(true);
        expect(classifyFeedRow(noImage, { allowMissingImage: true }).reasons).toEqual([]);
        // mais GTIN/prix restent requis même sous le flag
        expect(classifyFeedRow(r({ ean: null, photo_url: null, photo_processed_url: null }), { allowMissingImage: true }).reasons).toEqual(["missing_ean"]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CHEMIN RÉEL — GET /api/google/feed-preview (faux client server + transform réel)
// ─────────────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
type TableData = { rows: Row[]; error: { code?: string; message: string } | null };

function makeServerClient(opts: {
    user: { id: string } | null;
    tables: Record<string, TableData>;
}) {
    function builder(table: string) {
        const filters: Array<{ col: string; val: unknown }> = [];
        const td = opts.tables[table] ?? { rows: [], error: null };

        function resolve(): { data: Row[] | null; error: TableData["error"] } {
            if (td.error) return { data: null, error: td.error };
            const rows = td.rows.filter((r) =>
                filters.every((f) =>
                    f.val === null ? r[f.col] === null || r[f.col] === undefined : r[f.col] === f.val,
                ),
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
            not: () => api,
            // `.order("id")` (anti-troncature pagination) : dataset déterministe → no-op.
            order: () => api,
            // Pagination KEYSET `fetchAllRows` : `.gt("id", curseur)` puis `.limit(n)`.
            // Dataset de test petit (< pageSize) → 1 page : `.limit()` renvoie tout et
            // propage une erreur DB injectée ; le curseur n'est jamais posé.
            gt: () => api,
            limit: () => {
                const { data, error } = resolve();
                return Promise.resolve({ data, error });
            },
            single: () => {
                const { data, error } = resolve();
                if (error) return Promise.resolve({ data: null, error });
                if (!data || data.length === 0)
                    return Promise.resolve({ data: null, error: { code: "PGRST116", message: "no rows" } });
                return Promise.resolve({ data: data[0], error: null });
            },
            maybeSingle: () => {
                const { data, error } = resolve();
                if (error) return Promise.resolve({ data: null, error });
                if (!data || data.length === 0) return Promise.resolve({ data: null, error: null });
                return Promise.resolve({ data: data[0], error: null });
            },
            then: (onfulfilled: (v: { data: Row[] | null; error: unknown }) => unknown) =>
                Promise.resolve(resolve()).then(onfulfilled),
        };
        return api;
    }

    return {
        auth: { getUser: async () => ({ data: { user: opts.user }, error: null }) },
        from: (table: string) => builder(table),
    };
}

const mockClient = { current: null as ReturnType<typeof makeServerClient> | null };
vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => mockClient.current,
}));
const captureErrorMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureErrorMock(...a) }));

const USER_ID = "user-1";
const MERCHANT_ID = "11111111-2222-3333-4444-555555555555";

// Stock « in stock » honnête (M5) : source FIABLE (webhook) + source_ts FRAIS + qty > 2.
// Un stock sans source/périmé part désormais « out of stock » (cf. feed-availability.test.ts).
const freshStock = {
    quantity: 5,
    source: "webhook",
    source_ts: new Date(Date.now() - 60_000).toISOString(),
    updated_at: new Date().toISOString(),
};

function product(p: Partial<Row>): Row {
    return {
        id: "p-default",
        name: "Crème hydratante",
        canonical_name: null,
        description: null,
        brand: null,
        merchant_id: MERCHANT_ID,
        visible: true,
        review_status: "validated",
        archived_at: null,
        variant_of: null,
        ean: "0884776073143",
        price: 129.99,
        photo_url: "https://cdn/x.jpg",
        photo_processed_url: null,
        stock: [freshStock],
        promotions: [],
        ...p,
    };
}

describe("GET /api/google/feed-preview (chemin réel : parité transform + gardes)", () => {
    beforeEach(() => {
        mockClient.current = null;
        captureErrorMock.mockClear();
    });

    it("would_publish = le payload Google EXACT (parité transform) ; blocked = causes par produit", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, name: "Deerskin", user_id: USER_ID }], error: null },
                products: {
                    rows: [
                        product({ id: "ok-1", name: "Sérum vitamine C", ean: "3601234567890", price: 39.9, stock: [{ ...freshStock, quantity: 3 }] }),
                        product({ id: "ok-2-oos", name: "Masque", ean: "5012345678900", price: 12, stock: [{ ...freshStock, quantity: 0 }] }), // rupture → out of stock mais PUBLIÉ
                        // stock PÉRIMÉ (M5) → out of stock mais PUBLIÉ — le preview doit montrer la même
                        // disponibilité honnête que les 2 feeds live (parité feedAvailability).
                        product({
                            id: "ok-3-stale",
                            name: "Huile",
                            ean: "4012345678901",
                            stock: [{ ...freshStock, source_ts: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
                        }),
                        product({ id: "blk-img", name: "Lotion", photo_url: null, photo_processed_url: null }), // bloqué image
                        product({ id: "blk-ean", name: "Baume", ean: null }), // bloqué EAN
                        product({ id: "blk-2", name: "Gel", ean: "12", price: 0 }), // bloqué EAN + prix
                    ],
                    error: null,
                },
            },
        });

        const { GET } = await import("@/app/api/google/feed-preview/route");
        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.merchant_id).toBe(MERCHANT_ID);
        expect(body.store_code).toBe(resolveStoreCode(MERCHANT_ID, undefined)); // défaut déterministe twostep-{id8}
        expect(body.google_connected).toBe(false);
        expect(body.gtin_only_tier).toBe(false);

        // ── would_publish : 3 produits, payload Google champ par champ ──
        expect(body.would_publish).toHaveLength(3);
        const pub1 = body.would_publish.find((x: Row) => x.offerId === "ok-1");
        expect(pub1).toMatchObject({
            offerId: "ok-1",
            gtin: "3601234567890",
            title: "Sérum vitamine C",
            price: { value: "39.90", currency: "EUR" },
            availability: "in stock",
            channel: "local",
            contentLanguage: "fr",
            targetCountry: "FR",
            condition: "new",
            storeCode: body.store_code,
            imageLink: "https://cdn/x.jpg",
        });
        const pub2 = body.would_publish.find((x: Row) => x.offerId === "ok-2-oos");
        expect(pub2.availability).toBe("out of stock"); // qty 0 → honnête, mais reste dans le feed
        const pub3 = body.would_publish.find((x: Row) => x.offerId === "ok-3-stale");
        expect(pub3.availability).toBe("out of stock"); // stock PÉRIMÉ (M5) → honnête, mais reste dans le feed

        // ── blocked : 3 produits, causes exactes ──
        expect(body.blocked).toHaveLength(3);
        const byId = Object.fromEntries(body.blocked.map((b: Row) => [b.id, b]));
        expect(byId["blk-img"]).toMatchObject({ id: "blk-img", name: "Lotion", reasons: ["missing_image"] });
        expect(byId["blk-ean"].reasons).toEqual(["missing_ean"]);
        expect(byId["blk-2"].reasons).toEqual(["missing_ean", "missing_price"]);

        // ── summary cohérent avec /api/google/stats (même vocabulaire) ──
        expect(body.summary.total).toBe(6);
        expect(body.summary.publishable).toBe(3);
        expect(body.summary.blocked_only_by_image).toBe(1);
    });

    it("store_code PERSISTÉ prime sur le défaut (parité Voie A/B)", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, name: "Deerskin", user_id: USER_ID }], error: null },
                products: { rows: [product({ id: "ok-1" })], error: null },
                google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID, store_code: "twostep-persisted" }], error: null },
            },
        });

        const { GET } = await import("@/app/api/google/feed-preview/route");
        const body = await (await GET()).json();
        expect(body.store_code).toBe("twostep-persisted");
        expect(body.google_connected).toBe(true);
        expect(body.would_publish[0].storeCode).toBe("twostep-persisted");
    });

    it("EXCLUT archivés / variantes / non validés de la population (parité feed)", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, name: "D", user_id: USER_ID }], error: null },
                products: {
                    rows: [
                        product({ id: "keep" }),
                        product({ id: "arch", archived_at: "2026-06-01T00:00:00Z" }),
                        product({ id: "var", variant_of: "parent-1" }),
                        product({ id: "pend", review_status: "pending" }),
                    ],
                    error: null,
                },
            },
        });

        const { GET } = await import("@/app/api/google/feed-preview/route");
        const body = await (await GET()).json();
        expect(body.summary.total).toBe(1);
        expect(body.would_publish).toHaveLength(1);
        expect(body.would_publish[0].offerId).toBe("keep");
    });

    it("échec de LECTURE produits → 500 + captureError (jamais un preview all-empty silencieux)", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, name: "D", user_id: USER_ID }], error: null },
                products: { rows: [], error: { message: "connection reset" } },
            },
        });

        const { GET } = await import("@/app/api/google/feed-preview/route");
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.error).toBe("db_error");
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });

    it("erreur store_code (≠ pas connecté) → 200 quand même (lecture-seule) mais TRACÉE", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, name: "D", user_id: USER_ID }], error: null },
                products: { rows: [product({ id: "ok-1" })], error: null },
                google_merchant_connections: { rows: [], error: { message: "timeout" } },
            },
        });

        const { GET } = await import("@/app/api/google/feed-preview/route");
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200); // le preview reste utile
        expect(body.store_code).toBe(resolveStoreCode(MERCHANT_ID, undefined)); // repli déterministe
        // MED-1 (revue SF-hunter) : sur blip de lecture connexion, NE PAS affirmer « connecté »
        // (faux positif interdit) — émettre false conservateur, l'anomalie restant tracée via Sentry.
        expect(body.google_connected).toBe(false);
        expect(captureErrorMock).toHaveBeenCalledTimes(1); // mais l'anomalie est remontée
    });

    it("erreur DB sur le lookup marchand (≠ PGRST116) → 500, pas un 403 trompeur", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: { merchants: { rows: [], error: { code: "57014", message: "statement timeout" } } },
        });
        const { GET } = await import("@/app/api/google/feed-preview/route");
        const res = await GET();
        expect(res.status).toBe(500);
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });

    it("pas de profil marchand (PGRST116) → 403, pas de Sentry", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: { merchants: { rows: [], error: null } },
        });
        const { GET } = await import("@/app/api/google/feed-preview/route");
        const res = await GET();
        expect(res.status).toBe(403);
        expect(captureErrorMock).not.toHaveBeenCalled();
    });

    it("non authentifié → 401", async () => {
        mockClient.current = makeServerClient({ user: null, tables: {} });
        const { GET } = await import("@/app/api/google/feed-preview/route");
        const res = await GET();
        expect(res.status).toBe(401);
    });
});

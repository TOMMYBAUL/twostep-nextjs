import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    summarizePublishability,
    isFeedEligible,
    type FeedEligibleRow,
} from "@/lib/google/feed-eligibility";

/**
 * Item D3 — KPI « % publiable » du pilote, ventilé par cause.
 *
 * North-star §1 : Google teste la qualité du feed ; un marchand qui voit son catalogue
 * affiché faux s'en va. Le KPI « % publiable » EST ce que Thomas montre au pilote, donc
 * il doit dire la VÉRITÉ du feed — pas surévaluer.
 *
 * Bug réel prouvé (faux positif du KPI, même classe que maillon 7 / store_code) :
 * `/api/google/stats` calculait `eligible_google = ean && price !== null` → comptait
 * comme « éligibles » des produits SANS image, au prix 0, ou au GTIN tronqué que le feed
 * (`isFeedEligible`) rejette en silence. Et il sélectionnait `visible=true` SEULEMENT,
 * alors que le feed exige aussi validated + non archivé + non variante (un produit
 * archivé reste visible=true → faux positif). Résultat : le pilote croyait « 100 %
 * sur Google » alors que la moitié manquait une image.
 *
 * Méthode §1bis : sortie inspectée champ par champ sur une entrée SALE (catalogue mixte),
 * puis le CHEMIN RÉEL de la route (parité de population + garde silent-failure).
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fonction pure summarizePublishability — fixture catalogue SALE, champ par champ
// ─────────────────────────────────────────────────────────────────────────────
describe("D3 — summarizePublishability (fonction pure, fixture catalogue sale)", () => {
    const r = (p: Partial<FeedEligibleRow>): FeedEligibleRow => ({
        ean: "0884776073143",
        price: 129.99,
        photo_url: "https://cdn/x.jpg",
        photo_processed_url: null,
        ...p,
    });

    it("ventile un catalogue mixte par cause + réutilise EXACTEMENT le gate du feed", () => {
        const rows: FeedEligibleRow[] = [
            // 2 réellement publiables (EAN + prix + image)
            r({}),
            r({ ean: "3601234567890", photo_processed_url: "https://r2/y.webp", photo_url: null }),
            // bloqué SEULEMENT par l'image (EAN + prix OK) → cible D2/D5
            r({ photo_url: null, photo_processed_url: null }),
            // 2e bloqué seulement image
            r({ ean: "12345678", photo_url: null, photo_processed_url: null }),
            // pas d'EAN du tout
            r({ ean: null }),
            // EAN tronqué (<8) que l'ancien proxy `ean &&` acceptait à tort
            r({ ean: "1234" }),
            // prix 0 (gratuit attesté) — le feed rejette price>0
            r({ price: 0 }),
            // prix null
            r({ price: null }),
            // cumul : ni EAN ni image (compte dans missing_ean ET missing_image, pas blocked_only_by_image)
            r({ ean: null, photo_url: null, photo_processed_url: null }),
        ];

        const s = summarizePublishability(rows);

        expect(s.total).toBe(9);
        expect(s.publishable).toBe(2);
        // missing_ean : null + tronqué + cumul = 3
        expect(s.missing_ean).toBe(3);
        // missing_price : prix 0 + prix null = 2
        expect(s.missing_price).toBe(2);
        // missing_image : 2 bloqués-image + le cumul = 3
        expect(s.missing_image).toBe(3);
        // blocked_only_by_image : les 2 qui n'ont QUE l'image manquante (pas le cumul sans EAN)
        expect(s.blocked_only_by_image).toBe(2);
        // score = round(2/9*100) = 22
        expect(s.score).toBe(22);

        // PARITÉ : publishable == count(isFeedEligible) sur la même fixture (source unique)
        expect(s.publishable).toBe(rows.filter(isFeedEligible).length);
    });

    it("catalogue vide → score 0, aucune division par zéro", () => {
        expect(summarizePublishability([])).toEqual({
            total: 0,
            publishable: 0,
            missing_ean: 0,
            missing_price: 0,
            missing_image: 0,
            blocked_only_by_image: 0,
            score: 0,
        });
    });

    it("catalogue 100 % publiable → score 100", () => {
        const s = summarizePublishability([r({}), r({ ean: "5012345678900" })]);
        expect(s.publishable).toBe(2);
        expect(s.score).toBe(100);
        expect(s.blocked_only_by_image).toBe(0);
    });

    it("un produit sans EAN ET sans prix compte dans les deux causes mais PAS dans blocked_only_by_image", () => {
        const s = summarizePublishability([r({ ean: null, price: null })]);
        expect(s.missing_ean).toBe(1);
        expect(s.missing_price).toBe(1);
        expect(s.blocked_only_by_image).toBe(0); // image présente mais EAN+prix KO
        expect(s.publishable).toBe(0);
    });

    // PARITÉ FLAG (revue SF-hunter HIGH) : le KPI prédit `isFeedEligible`, qui sous le tier GTIN-only
    // (`allowMissingImage`) publie les produits GTIN+prix SANS image. Le KPI doit suivre les DEUX états.
    it("tier GTIN-only (allowMissingImage): un produit GTIN+prix sans image devient publiable + parité feed", () => {
        const rows: FeedEligibleRow[] = [
            r({}), // publiable normal (avec image)
            r({ ean: "3601234567890", photo_url: null, photo_processed_url: null }), // GTIN+prix, sans image
            r({ ean: null, photo_url: null, photo_processed_url: null }), // sans EAN → jamais publiable
            r({ price: 0, photo_url: null, photo_processed_url: null }), // prix 0 → jamais publiable
        ];

        const off = summarizePublishability(rows); // flag OFF (défaut) — image requise
        expect(off.publishable).toBe(1);
        expect(off.blocked_only_by_image).toBe(1); // le GTIN+prix sans image est BLOQUÉ
        expect(off.publishable).toBe(rows.filter((p) => isFeedEligible(p)).length);

        const on = summarizePublishability(rows, { allowMissingImage: true }); // tier GTIN-only
        expect(on.publishable).toBe(2); // le GTIN+prix sans image PUBLIE maintenant
        expect(on.blocked_only_by_image).toBe(0); // plus rien n'est bloqué QUE par l'image
        expect(on.missing_image).toBe(3); // l'info « sans image » reste comptée (fait actionnable)
        // PARITÉ : publishable == count(isFeedEligible avec le MÊME flag) — source unique anti-dérive
        expect(on.publishable).toBe(rows.filter((p) => isFeedEligible(p, { allowMissingImage: true })).length);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CHEMIN RÉEL de la route GET /api/google/stats
//    Faux client server : .auth.getUser() + .from().select().eq()[.eq().is().is()]
//    thenable + .single(), avec erreurs injectables par table.
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

        const gts: Array<{ col: string; val: unknown }> = [];
        let orderCol: string | null = null;
        let limitN: number | null = null;

        function resolve(): { data: Row[] | null; error: TableData["error"] } {
            if (td.error) return { data: null, error: td.error };
            let rows = td.rows.filter((r) =>
                filters.every((f) =>
                    f.val === null ? r[f.col] === null || r[f.col] === undefined : r[f.col] === f.val,
                ),
            );
            // KEYSET fetchAllRows : `.gt(col, curseur)` = borne basse EXCLUSIVE par valeur.
            rows = rows.filter((r) => gts.every((g) => String(r[g.col]) > String(g.val)));
            if (orderCol) rows = [...rows].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])));
            // Fidèle à PostgREST : plafond `max-rows` (1000) SANS erreur, même sans .limit().
            const cap = Math.min(limitN ?? 1000, 1000);
            if (rows.length > cap) rows = rows.slice(0, cap);
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
            gt: (col: string, val: unknown) => {
                gts.push({ col, val });
                return api;
            },
            order: (col: string) => {
                orderCol = col;
                return api;
            },
            limit: (n: number) => {
                limitN = n;
                return api;
            },
            single: () => {
                const { data, error } = resolve();
                if (error) return Promise.resolve({ data: null, error });
                if (!data || data.length === 0)
                    return Promise.resolve({ data: null, error: { code: "PGRST116", message: "no rows" } });
                return Promise.resolve({ data: data[0], error: null });
            },
            // maybeSingle : 0 ligne → data=null SANS error (≠ single qui renvoie PGRST116).
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
const MERCHANT_ID = "merch-1";

function product(p: Partial<Row>): Row {
    return {
        merchant_id: MERCHANT_ID,
        visible: true,
        review_status: "validated",
        archived_at: null,
        variant_of: null,
        ean: "0884776073143",
        price: 129.99,
        photo_url: "https://cdn/x.jpg",
        photo_processed_url: null,
        ...p,
    };
}

describe("D3 — GET /api/google/stats (chemin réel : parité feed + garde silent-failure)", () => {
    beforeEach(() => {
        mockClient.current = null;
        captureErrorMock.mockClear();
    });

    it("le KPI N'éligibilise PAS un produit sans image (l'ancien proxy ean&&price le faisait)", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, user_id: USER_ID }], error: null },
                products: {
                    rows: [
                        product({}), // publiable
                        product({ ean: "5012345678900", photo_url: null, photo_processed_url: null }), // sans image
                    ],
                    error: null,
                },
            },
        });

        const { GET } = await import("@/app/api/google/stats/route");
        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.total_visible).toBe(2);
        expect(body.eligible_google).toBe(1); // PAS 2 — le sans-image est exclu (vérité feed)
        expect(body.missing_photo).toBe(1);
        expect(body.blocked_only_by_image).toBe(1);
        expect(body.score).toBe(50);
    });

    it("EXCLUT de la population les produits archivés / variantes / non validés (parité feed)", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, user_id: USER_ID }], error: null },
                products: {
                    rows: [
                        product({}), // compte
                        product({ archived_at: "2026-06-01T00:00:00Z" }), // archivé resté visible → exclu
                        product({ variant_of: "parent-1" }), // variante → exclu
                        product({ review_status: "pending" }), // non validé → exclu
                    ],
                    error: null,
                },
            },
        });

        const { GET } = await import("@/app/api/google/stats/route");
        const res = await GET();
        const body = await res.json();

        expect(body.total_visible).toBe(1); // seul le produit pleinement publiable est dans la population
        expect(body.eligible_google).toBe(1);
        expect(body.score).toBe(100);
    });

    it("échec de LECTURE produits → 500 + captureError (jamais un KPI all-zeros silencieux)", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, user_id: USER_ID }], error: null },
                products: { rows: [], error: { message: "connection reset" } },
            },
        });

        const { GET } = await import("@/app/api/google/stats/route");
        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body.error).toBe("db_error");
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });

    it("erreur DB sur le lookup marchand (≠ PGRST116) → 500, pas un 403 trompeur", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [], error: { code: "57014", message: "statement timeout" } },
            },
        });

        const { GET } = await import("@/app/api/google/stats/route");
        const res = await GET();
        expect(res.status).toBe(500);
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });

    it("pas de profil marchand (PGRST116) → 403, pas de Sentry", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: { merchants: { rows: [], error: null } },
        });

        const { GET } = await import("@/app/api/google/stats/route");
        const res = await GET();
        expect(res.status).toBe(403);
        expect(captureErrorMock).not.toHaveBeenCalled();
    });

    it("non authentifié → 401", async () => {
        mockClient.current = makeServerClient({ user: null, tables: {} });
        const { GET } = await import("@/app/api/google/stats/route");
        const res = await GET();
        expect(res.status).toBe(401);
    });

    // ── Readiness LFP (item READINESS) — wiring du chemin réel route → evaluateFeedReadiness ──
    it("≥ 11 offres publiables ET connecté → lfp_feed_ready, 0 blocker, shortfall 0", async () => {
        const eans = Array.from({ length: 12 }, (_, i) => `001234567890${i % 10}`);
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, user_id: USER_ID }], error: null },
                products: { rows: eans.map((ean) => product({ ean })), error: null },
                google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }], error: null },
            },
        });

        const { GET } = await import("@/app/api/google/stats/route");
        const body = await (await GET()).json();
        expect(body.eligible_google).toBe(12);
        expect(body.lfp_offers_threshold).toBe(11);
        expect(body.lfp_meets_offer_threshold).toBe(true);
        expect(body.lfp_offer_shortfall).toBe(0);
        expect(body.google_connected).toBe(true);
        expect(body.lfp_feed_ready).toBe(true);
        expect(body.lfp_blockers).toEqual([]);
    });

    it("trop peu d'offres ET pas de connexion → pas prêt, deux blockers, shortfall honnête", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, user_id: USER_ID }], error: null },
                products: { rows: [product({}), product({ ean: "0012345678901" })], error: null },
                // pas de google_merchant_connections → maybeSingle data=null → non connecté
            },
        });

        const { GET } = await import("@/app/api/google/stats/route");
        const body = await (await GET()).json();
        expect(body.eligible_google).toBe(2);
        expect(body.lfp_meets_offer_threshold).toBe(false);
        expect(body.lfp_offer_shortfall).toBe(9); // 11 - 2
        expect(body.google_connected).toBe(false);
        expect(body.lfp_feed_ready).toBe(false);
        expect(body.lfp_blockers).toEqual(["below_offer_threshold", "google_not_connected"]);
    });

    it("échec de lecture de la CONNEXION ≠ « pas connecté » → 500 + captureError (anti faux négatif)", async () => {
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, user_id: USER_ID }], error: null },
                products: { rows: [product({})], error: null },
                google_merchant_connections: { rows: [], error: { message: "connection reset" } },
            },
        });

        const { GET } = await import("@/app/api/google/stats/route");
        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body.error).toBe("db_error");
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });

    // ── SCALE >1000 (P0-13) : anti-troncature `max-rows` sur le SELECT produits du KPI ──
    it("SCALE : 1500 produits validés → KPI calculé sur les 1500 (SELECT PAGINÉ keyset, pas plafonné à 1000)", async () => {
        // Sans fetchAllRows, PostgREST rend 1000 lignes SANS erreur → total_visible/eligible
        // /score et la readiness LFP étaient calculés sur un sous-ensemble silencieux.
        // Le faux client plafonne à 1000 par requête (fidèle à max-rows) : 1500 exige 2 pages.
        const rows = Array.from({ length: 1500 }, (_, i) =>
            product({ id: `p${String(i).padStart(5, "0")}` }), // id = colonne-curseur keyset
        );
        mockClient.current = makeServerClient({
            user: { id: USER_ID },
            tables: {
                merchants: { rows: [{ id: MERCHANT_ID, user_id: USER_ID }], error: null },
                products: { rows, error: null },
                google_merchant_connections: { rows: [{ merchant_id: MERCHANT_ID }], error: null },
            },
        });

        const { GET } = await import("@/app/api/google/stats/route");
        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.total_visible).toBe(1500); // pas 1000
        expect(body.eligible_google).toBe(1500); // tous publiables (ean+prix+image)
        expect(body.score).toBe(100);
        expect(body.lfp_feed_ready).toBe(true);
    });
});

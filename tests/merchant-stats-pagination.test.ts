import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P0-3 (reliquat sweep silent-truncation, Explore 2026-07-07 — vérifié au code réel) :
 * `GET /api/merchants/[id]/stats` = les KPI stock + Two-Step Score du DASHBOARD marchand
 * (consommé par `use-dashboard-stats` et par le coach `tips`). Trois trous même classe :
 *
 *  1. La lecture `products` était NON bornée → tronquée SILENCIEUSEMENT à 1000 par
 *     PostgREST (`max-rows`) : sur un catalogue pilote (Deerskin = milliers de SKU),
 *     total/inStock/outOfStock/withPhoto et le score étaient calculés sur un sous-
 *     ensemble → le marchand qui vient de pousser 1500 produits lit « 1000 ».
 *  2. Une DEUXIÈME lecture non bornée des mêmes produits (pour compter les promos)
 *     avait la même troncature + `.in()` non chunké (liste d'ids > limite d'URL).
 *  3. Erreurs avalées : lecture produits (`const { data }`) → KPI all-zeros silencieux
 *     sur blip DB ; lecture merchant → faux 404. Les 2 consommateurs gatent `res.ok`
 *     → un 500 honnête est le bon contrat.
 *
 * Preuve non-vacante : le faux client enregistre les curseurs keyset et les lots `.in()`.
 */

const CATALOG = 1500; // > max-rows (1000)
const MAX_ROWS = 1000;
const MERCHANT_ID = "11111111-1111-1111-1111-111111111111";

const h = {
    pageCursors: [] as Array<string | null>,
    promoInBatches: [] as string[][],
    productsError: null as { message: string } | null,
    productsThrow: false,
    merchantError: null as { code: string; message: string } | null,
    promoCountPerBatch: 0,
    promoThrow: false,
};

vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient() }));

/**
 * 1500 produits, ids en ordre lexical (= ordre `.order("id")`). Les produits d'index
 * 1200 (rupture) et 1300 (stock bas) sont AU-DELÀ du 1000ᵉ : sans pagination ils sont
 * invisibles → outOfStock/lowStock resteraient à 0 (compteurs faux en silence).
 */
function makeProducts(): Array<Record<string, unknown>> {
    return Array.from({ length: CATALOG }, (_, i) => ({
        id: `p${String(i).padStart(5, "0")}`,
        name: `Produit ${i}`,
        photo_url: "https://example.com/p.jpg",
        ean: "1234567890123",
        created_at: "2026-01-01T00:00:00Z",
        stock: [{ quantity: i === 1200 ? 0 : i === 1300 ? 2 : 5, updated_at: "2026-07-01T00:00:00Z" }],
    }));
}

const MERCHANT_ROW = {
    id: MERCHANT_ID,
    name: "Boutique Test",
    photo_url: null,
    status: "active",
    pos_type: null,
    description: null,
    address: null,
    opening_hours: null,
    pos_last_sync: null,
    instagram_url: null,
    tiktok_url: null,
    website_url: null,
};

/** Faux client minimal fidèle à PostgREST : `.limit(n)` plafonné à 1000 (max-rows). */
function makeClient() {
    const products = makeProducts();

    function builder(table: string) {
        const st = {
            cursor: null as string | null,
            limitN: null as number | null,
            inIds: null as string[] | null,
        };

        const resolve = () => {
            if (table === "products") {
                if (h.productsThrow) throw new Error("transport reset (hors contrat {data,error})");
                if (h.productsError) return { data: null, error: h.productsError, count: null };
                h.pageCursors.push(st.cursor);
                let rows = products;
                if (st.cursor != null) rows = rows.filter((r) => (r.id as string) > st.cursor!);
                const cap = Math.min(st.limitN ?? MAX_ROWS, MAX_ROWS);
                if (rows.length > cap) rows = rows.slice(0, cap);
                return { data: rows, error: null, count: null };
            }
            if (table === "promotions") {
                if (h.promoThrow) throw new Error("network cut mid-request");
                h.promoInBatches.push(st.inIds ?? []);
                return { data: null, error: null, count: h.promoCountPerBatch };
            }
            // page_views / user_favorites / user_follows : métriques d'engagement à 0.
            return { data: [], error: null, count: 0 };
        };

        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.gte = () => b;
        b.lt = () => b;
        b.lte = () => b;
        b.or = () => b;
        b.is = () => b;
        b.order = () => b;
        b.gt = (_col: string, val: string) => {
            st.cursor = val;
            return b;
        };
        b.limit = (n: number) => {
            st.limitN = n;
            return b;
        };
        b.in = (_col: string, ids: string[]) => {
            st.inIds = ids;
            return b;
        };
        b.single = async () =>
            h.merchantError
                ? { data: null, error: h.merchantError }
                : { data: MERCHANT_ROW, error: null };
        b.maybeSingle = async () => ({ data: null, error: null });
        b.then = (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) =>
            Promise.resolve(resolve()).then(ok, err);
        return b;
    }

    return {
        from: (table: string) => builder(table),
        auth: { getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }) },
    } as never;
}

beforeEach(() => {
    h.pageCursors = [];
    h.promoInBatches = [];
    h.productsError = null;
    h.productsThrow = false;
    h.merchantError = null;
    h.promoCountPerBatch = 0;
    h.promoThrow = false;
});

async function callGet() {
    const { GET } = await import("@/app/api/merchants/[id]/stats/route");
    const req = new Request(`http://localhost/api/merchants/${MERCHANT_ID}/stats`) as never;
    return (await GET(req, { params: Promise.resolve({ id: MERCHANT_ID }) })) as Response;
}

describe("GET /api/merchants/[id]/stats — pagination anti-troncature (dashboard pilote > max-rows)", () => {
    it("compte les 1500 produits en 2 pages KEYSET — ruptures/stock bas AU-DELÀ du 1000ᵉ inclus", async () => {
        const res = await callGet();
        const json = await res.json();

        expect(res.status).toBe(200);
        // Pagination non-vacante : 1re page sans curseur, 2e bornée au dernier id de la 1re.
        expect(h.pageCursors).toEqual([null, `p${String(MAX_ROWS - 1).padStart(5, "0")}`]);
        // Sans le fix : total plafonné à 1000, la rupture #1200 et le stock bas #1300 INVISIBLES.
        expect(json.stock.total).toBe(CATALOG);
        expect(json.stock.outOfStock).toBe(1);
        expect(json.stock.lowStock).toBe(1);
        expect(json.stock.inStock).toBe(CATALOG - 1); // tout sauf la rupture (#1300 = stock bas > 0)
        expect(json.stock.withPhoto).toBe(CATALOG);
    });

    it("compte les promos sur TOUS les produits, en lots .in() ≤ 500 (pas une liste d'ids tronquée)", async () => {
        h.promoCountPerBatch = 1;
        const res = await callGet();
        const json = await res.json();

        expect(res.status).toBe(200);
        // 1500 ids → 3 lots de 500 (l'ancien code : UN .in() sur une liste tronquée à 1000).
        expect(h.promoInBatches.map((b) => b.length)).toEqual([500, 500, 500]);
        // Les ids au-delà du 1000ᵉ sont couverts (le lot 3 contient p01200).
        expect(h.promoInBatches[2]).toContain("p01200");
        // Les comptes par lot s'ADDITIONNENT.
        expect(json.activePromos).toBe(3);
    });

    it("échec de lecture products → 500 (jamais des KPI all-zeros présentés comme un catalogue vide)", async () => {
        h.productsError = { message: "db down" };
        const res = await callGet();
        expect(res.status).toBe(500);
    });

    it("THROW JS sur la lecture products (hors contrat {data,error}) → 500 contextualisé, pas un crash", async () => {
        h.productsThrow = true;
        const res = await callGet();
        expect(res.status).toBe(500);
        const { captureError } = await import("@/lib/error");
        expect(vi.mocked(captureError)).toHaveBeenCalled();
    });

    it("THROW JS sur un lot promos → les KPI stock déjà lus SURVIVENT (200, activePromos dégradé)", async () => {
        h.promoThrow = true;
        const res = await callGet();
        const json = await res.json();
        expect(res.status).toBe(200); // jamais perdre toute la réponse pour la métrique secondaire
        expect(json.stock.total).toBe(CATALOG);
        expect(json.activePromos).toBe(0);
    });

    it("blip DB sur la lecture merchant → 500 (jamais un faux 404), PGRST116 → vrai 404", async () => {
        h.merchantError = { code: "XX000", message: "connection reset" };
        expect((await callGet()).status).toBe(500);

        h.merchantError = { code: "PGRST116", message: "0 rows" };
        expect((await callGet()).status).toBe(404);
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SCALE / VOLUME — anti-troncature `max-rows` PostgREST sur les 4 SORTIES Google
 * (priorities §1bis item #4 + LESSONS « SELECT non borné → troncature silencieuse à 1000 »).
 *
 * Symétrique au fix ingestion (`tests/ingest-snapshot-pagination.test.ts`) : un SELECT non
 * borné est tronqué SILENCIEUSEMENT à 1000 lignes par PostgREST. Les 4 lectures produits qui
 * ALIMENTENT Google partageaient ce trou — sur un catalogue >1000 (pilote multimarque type
 * Deerskin = des milliers de SKU) chacune publierait un feed PARTIEL sans aucune alerte :
 *  - Voie A cron `google-feed`        → seuls les 1000 premiers poussés via Content API
 *  - Voie B XML `feed/lfp/[id]`       → XML crawlé par Google tronqué à 1000
 *  - `google/feed-preview`            → le marchand croit son catalogue tronqué (mensonge par omission)
 *  - `google/inventory` (temps réel)  → un vendu au-delà du 1000ᵉ reste « in stock » sur Google (faux positif n°1)
 *
 * Chaque chemin enveloppe désormais sa lecture dans `fetchAllRows`/`streamRows(() => ….order("id"))`,
 * en pagination KEYSET (`.gt("id", curseur)` = borne basse par VALEUR, dérive-immune).
 * Preuve UNIVERSELLE (indépendante de l'éligibilité) : le faux client enregistre le curseur de
 * chaque page → un catalogue de 1500 doit produire DEUX pages (curseur `null` puis `"p00999"`)
 * (le code d'origine, non paginé, serait plafonné à 1000). Preuves aval (compteurs) là où elles
 * sont bon marché : inventory pousse 1500, cron pousse 1500, preview voit 1500.
 */

const CATALOG = 1500; // > max-rows (1000)
const MAX_ROWS = 1000;

// ── Holders mutables référencés par les mocks hoistés (réinitialisés par test). ──
const h = {
    pageCursors: [] as Array<string | null>, // curseur keyset de chaque page products lue
    googleFetchCount: 0,
    connections: [] as Array<Record<string, unknown>>,
};

vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/google/merchant", () => ({
    getGoogleAccessToken: vi.fn(async () => ({
        connection: { google_merchant_id: "acc-1" },
        accessToken: "tok",
    })),
    googleMerchantFetch: vi.fn(async () => {
        h.googleFetchCount++;
        return {};
    }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => makeClient() }));

// 1500 produits TOUS éligibles (ean ≥ 8 chiffres, prix > 0, image non vide) → les compteurs
// aval valent 1500 ssi toutes les lignes ont été lues (pagination), pas seulement 1000.
function makeProducts(): Array<Record<string, unknown>> {
    return Array.from({ length: CATALOG }, (_, i) => ({
        id: `p${String(i).padStart(5, "0")}`, // ordre lexical = ordre .order("id")
        name: `Produit ${i}`,
        canonical_name: `Produit ${i}`,
        description: "desc",
        brand: "ACME",
        ean: "1234567890123",
        price: 9.99,
        photo_url: "https://img/x.jpg",
        photo_processed_url: null,
        visible: true,
        review_status: "validated",
        archived_at: null,
        variant_of: null,
        stock: [{ quantity: 5 }],
        promotions: [],
    }));
}

/**
 * Faux client Supabase minimal, fidèle à PostgREST en KEYSET : `.limit(n)` est plafonné à 1000
 * (max-rows), `.gt("id", curseur)` borne la page suivante par VALEUR. Chaque page products lue
 * enregistre son curseur d'entrée dans `h.pageCursors`.
 */
function makeClient() {
    const products = makeProducts(); // déjà triés par id (padStart → ordre lexical = numérique)

    function builder(table: string) {
        const st = {
            single: false,
            cursor: null as string | null,
            limitN: null as number | null,
            op: "select" as "select" | "update",
        };

        const resolve = () => {
            if (table === "products") {
                h.pageCursors.push(st.cursor);
                let rows = products;
                // KEYSET : borne basse EXCLUSIVE par valeur d'id (dérive-immune).
                if (st.cursor != null) rows = rows.filter((r) => (r.id as string) > st.cursor!);
                // Plafond min(limit demandé, max-rows) — PostgREST tronque même une limite plus large.
                const cap = Math.min(st.limitN ?? MAX_ROWS, MAX_ROWS);
                if (rows.length > cap) rows = rows.slice(0, cap);
                return { data: rows, error: null };
            }
            if (table === "merchants") {
                return { data: { id: "m-1", name: "Boutique Test", status: "active" }, error: null };
            }
            if (table === "google_merchant_connections") {
                if (st.op === "update") return { data: null, error: null };
                if (st.single) return { data: { store_code: "twostep-abcd1234" }, error: null };
                return { data: h.connections, error: null }; // liste (cron)
            }
            return { data: null, error: null };
        };

        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.is = () => b;
        b.not = () => b;
        b.in = () => b;
        // Curseur keyset : seul `.gt("id", curseur)` de fetchAllRows/streamRows nous intéresse.
        b.gt = (col: string, val: unknown) => {
            if (col === "id") st.cursor = val as string;
            return b;
        };
        b.order = () => b;
        b.update = () => {
            st.op = "update";
            return b;
        };
        b.limit = (n: number) => {
            st.limitN = n;
            return b;
        };
        b.maybeSingle = () => {
            st.single = true;
            return Promise.resolve(resolve());
        };
        b.single = () => {
            st.single = true;
            return Promise.resolve(resolve());
        };
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
    h.googleFetchCount = 0;
    h.connections = [];
});

/**
 * Le balayage doit couvrir DEUX pages en KEYSET : 1re page sans curseur (null), 2e page
 * bornée par le dernier id de la 1re page pleine (`"p00999"`) → dérive-immune, pas d'offset.
 */
function expectTwoPages() {
    expect(h.pageCursors).toEqual([null, `p${String(MAX_ROWS - 1).padStart(5, "0")}`]);
}

describe("SORTIES Google — pagination anti-troncature sur catalogue > max-rows (1500)", () => {
    it("Voie A cron google-feed : lit les 1500 (2 pages) et en pousse 1500", async () => {
        process.env.CRON_SECRET = "secret";
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-abcd1234" }];
        const { POST } = await import("@/app/api/cron/google-feed/route");
        const req = new Request("http://x/api/cron/google-feed", {
            method: "POST",
            headers: { authorization: "Bearer secret" },
        }) as never;
        const res = await POST(req);
        const json = await (res as Response).json();

        expectTwoPages();
        expect(json.products_pushed).toBe(CATALOG); // sans pagination : ≤ 1000
        expect(h.googleFetchCount).toBe(CATALOG);
    });

    it("Voie B XML feed/lfp/[merchantId] : lit les 1500 (2 pages), XML contient les 1500", async () => {
        const { GET } = await import("@/app/api/feed/lfp/[merchantId]/route");
        const res = await GET({} as never, {
            params: Promise.resolve({ merchantId: "11111111-1111-1111-1111-111111111111" }),
        });
        const xml = await (res as Response).text();

        expectTwoPages();
        // buildLfpXml émet une entrée <item> par produit éligible → 1500, pas ≤ 1000.
        const items = (xml.match(/<item>/g) || []).length;
        expect(items).toBe(CATALOG);
    });

    it("google/feed-preview : lit les 1500 (2 pages), le preview en voit 1500", async () => {
        const { GET } = await import("@/app/api/google/feed-preview/route");
        const res = await GET();
        const json = await (res as Response).json();

        expectTwoPages();
        expect(json.summary.total).toBe(CATALOG); // tout le catalogue considéré
        expect(json.would_publish.length + json.blocked.length).toBe(CATALOG);
    });

    it("google/inventory pushInventoryToGoogle : lit les 1500 (2 pages), pousse 1500 à Google", async () => {
        const { pushInventoryToGoogle } = await import("@/lib/google/inventory");
        await pushInventoryToGoogle("m-1");

        expectTwoPages();
        expect(h.googleFetchCount).toBe(CATALOG); // un localInventories:insert par produit
    });
});

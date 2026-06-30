import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SCALE / VOLUME — Voie B feed XML LFP en STREAMING (mémoire bornée).
 *
 * Le feed `GET /api/feed/lfp/[merchantId]` matérialisait TOUT le XML en RAM
 * (`fetchAllRows` → tableau complet → `.map().join()` → chaîne complète). Sur un
 * catalogue 50k (pilote multimarque) c'est 3 copies du catalogue résidentes. Le feed
 * est désormais ÉMIS en flux (head → items page par page via `streamRows` → tail).
 *
 * Invariant NORTH-STAR prouvé ici (le vrai risque du streaming) : une lecture qui
 * échoue APRÈS le début du flux ne doit JAMAIS produire un 200 « complet » tronqué
 * (Google le crawlerait comme le catalogue entier = perte silencieuse n°1). Elle doit
 * AVORTER le transfert HTTP. Une erreur sur la 1re page, elle, donne encore un vrai 500.
 */

const MERCHANT_ID = "11111111-1111-1111-1111-111111111111";

const captureError = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureError(...a) }));

// Config mutable du faux client products (réinitialisée par test).
const cfg = {
    total: 0,
    /** index de page (0-based) sur laquelle `.range()` renvoie une erreur, ou null. */
    errorOnPage: null as number | null,
    rangeCalls: [] as Array<[number, number]>,
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));

const MAX_ROWS = 1000;

function makeClient() {
    function builder(table: string) {
        const st = { rangeFrom: null as number | null, rangeTo: null as number | null };

        const resolveProducts = () => {
            const from = st.rangeFrom!;
            const to = st.rangeTo!;
            const pageIndex = Math.floor(from / MAX_ROWS);
            cfg.rangeCalls.push([from, to]);
            if (cfg.errorOnPage === pageIndex) {
                return {
                    data: null,
                    error: { message: `boom-page-${pageIndex}`, code: "X", details: "", hint: "" },
                };
            }
            const rows = [];
            const end = Math.min(to, cfg.total - 1);
            for (let i = from; i <= end && rows.length < MAX_ROWS; i++) {
                rows.push({
                    id: `p${String(i).padStart(6, "0")}`,
                    name: `Produit ${i}`,
                    canonical_name: `Produit ${i}`,
                    description: "desc",
                    brand: "ACME",
                    ean: "1234567890123",
                    price: 9.99,
                    photo_url: "https://img/x.jpg",
                    photo_processed_url: null,
                    stock: [{ quantity: 5 }],
                    promotions: [],
                });
            }
            return { data: rows, error: null };
        };

        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = () => b;
        b.is = () => b;
        b.order = () => b;
        b.range = (f: number, t: number) => {
            st.rangeFrom = f;
            st.rangeTo = t;
            return b;
        };
        b.maybeSingle = () => {
            if (table === "merchants") {
                return Promise.resolve({
                    data: { id: MERCHANT_ID, name: "Boutique Test", status: "active" },
                    error: null,
                });
            }
            if (table === "google_merchant_connections") {
                return Promise.resolve({ data: { store_code: "twostep-abcd1234" }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        };
        b.then = (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) =>
            Promise.resolve(resolveProducts()).then(ok, err);
        return b;
    }
    return { from: (table: string) => builder(table) } as never;
}

async function callRoute() {
    const { GET } = await import("@/app/api/feed/lfp/[merchantId]/route");
    return GET({} as never, { params: Promise.resolve({ merchantId: MERCHANT_ID }) });
}

beforeEach(() => {
    captureError.mockClear();
    cfg.total = 0;
    cfg.errorOnPage = null;
    cfg.rangeCalls = [];
});

describe("feed/lfp/[merchantId] — streaming", () => {
    it("catalogue > max-rows : émet TOUS les items en flux (3 pages, 2500 items)", async () => {
        cfg.total = 2500;
        const res = (await callRoute()) as Response;
        expect(res.status).toBe(200);
        const xml = await res.text();
        const items = (xml.match(/<item>/g) || []).length;
        expect(items).toBe(2500); // 0 perte (sans pagination : ≤ 1000)
        expect(cfg.rangeCalls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
        // XML bien formé : header + footer présents.
        expect(xml).toContain('<rss version="2.0"');
        expect(xml.trimEnd().endsWith("</rss>")).toBe(true);
    });

    it("catalogue vide : feed valide sans <item> (200)", async () => {
        cfg.total = 0;
        const res = (await callRoute()) as Response;
        expect(res.status).toBe(200);
        const xml = await res.text();
        expect(xml).toContain("<channel>");
        expect(xml).not.toContain("<item>");
    });

    it("erreur 1re page → 500 propre (rien émis, le statut peut encore changer)", async () => {
        cfg.total = 2500;
        cfg.errorOnPage = 0;
        const res = (await callRoute()) as Response;
        expect(res.status).toBe(500);
        expect(captureError).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ step: "load-products" }),
        );
    });

    it("erreur sur une page ULTÉRIEURE → flux AVORTÉ, JAMAIS un 200 tronqué complet", async () => {
        cfg.total = 2500;
        cfg.errorOnPage = 1; // 1re page OK (flux démarré), 2e page échoue
        const res = (await callRoute()) as Response;
        // Le statut 200 est déjà parti, mais le CORPS doit errorer (transfert interrompu) —
        // Google ne reçoit jamais un feed « complet » silencieusement tronqué.
        await expect(res.text()).rejects.toThrow();
        expect(captureError).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ step: "stream-products" }),
        );
    });
});

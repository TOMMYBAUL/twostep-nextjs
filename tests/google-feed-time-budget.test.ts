import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * SCALE / VOLUME — le cron `google-feed` (Voie A) doit s'arrêter PROPREMENT avant le kill
 * Vercel sur un gros catalogue et écrire un statut HONNÊTE, jamais une troncature SILENCIEUSE
 * (priorities §1bis item #4 « timeouts crons/routes Vercel »).
 *
 * Régression de la perte n°1 : AVANT, le push bouclait N appels réseau séquentiels sans
 * borne de temps → Vercel tuait la fonction en plein vol → produits restants OMIS + l'écriture
 * de `last_feed_status` (en fin de boucle) JAMAIS atteinte → le marchand restait sur le
 * « success » du run précédent (feed partiel, aucun signal). On drive le VRAI POST avec une
 * horloge contrôlée : quand le budget est dépassé en plein marchand, le statut écrit DOIT être
 * "partial" (interrompu), `time_budget_exhausted:true`, et les marchands non traités signalés.
 */

const h = {
    updates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
    googleFetchCount: 0,
    connections: [] as Array<Record<string, unknown>>,
    catalogSize: 0,
    // delta de temps virtuel ajouté à chaque push Google (simule la latence réseau)
    msPerPush: 0,
};

let virtualNow = 0;

const captureErrorMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureErrorMock(...a) }));
vi.mock("@/lib/google/merchant", () => ({
    getGoogleAccessToken: vi.fn(async () => ({
        connection: { google_merchant_id: "acc-1" },
        accessToken: "tok",
    })),
    googleMerchantFetch: vi.fn(async () => {
        h.googleFetchCount++;
        virtualNow += h.msPerPush; // le temps « passe » à chaque appel réseau
        return {};
    }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));

function makeProducts(): Array<Record<string, unknown>> {
    return Array.from({ length: h.catalogSize }, (_, i) => ({
        id: `p${String(i).padStart(5, "0")}`,
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

/** Faux client : products paginé via `.range`, et update connections enregistré dans h.updates. */
function makeClient() {
    const products = makeProducts();

    function builder(table: string) {
        const st = {
            single: false,
            rangeFrom: null as number | null,
            rangeTo: null as number | null,
            op: "select" as "select" | "update",
            payload: null as Record<string, unknown> | null,
            eqId: null as string | null,
        };

        const resolve = () => {
            if (table === "products") {
                let rows = products;
                if (st.rangeFrom != null) rows = rows.slice(st.rangeFrom, st.rangeTo! + 1);
                return { data: rows, error: null };
            }
            if (table === "google_merchant_connections") {
                if (st.op === "update") {
                    h.updates.push({ id: st.eqId ?? "?", payload: st.payload ?? {} });
                    return { data: null, error: null };
                }
                return { data: h.connections, error: null };
            }
            return { data: null, error: null };
        };

        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = (col: string, val: string) => {
            if (col === "merchant_id") st.eqId = val;
            return b;
        };
        b.is = () => b;
        b.order = () => b;
        b.update = (payload: Record<string, unknown>) => {
            st.op = "update";
            st.payload = payload;
            return b;
        };
        b.range = (f: number, t: number) => {
            st.rangeFrom = f;
            st.rangeTo = t;
            return b;
        };
        b.then = (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) =>
            Promise.resolve(resolve()).then(ok, err);
        return b;
    }

    return { from: (table: string) => builder(table) } as never;
}

beforeEach(() => {
    h.updates = [];
    h.googleFetchCount = 0;
    h.connections = [];
    h.catalogSize = 0;
    h.msPerPush = 0;
    virtualNow = 1_000_000;
    captureErrorMock.mockClear();
    process.env.CRON_SECRET = "secret";
    // Horloge contrôlée : ne « passe » que via h.msPerPush (dans googleMerchantFetch).
    vi.spyOn(Date, "now").mockImplementation(() => virtualNow);
});

afterEach(() => {
    vi.restoreAllMocks();
});

async function callCron() {
    const { POST } = await import("@/app/api/cron/google-feed/route");
    const req = new Request("http://x/api/cron/google-feed", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
    }) as never;
    const res = await POST(req);
    return (res as Response).json();
}

describe("google-feed — budget temps (anti-troncature silencieuse Vercel)", () => {
    it("budget non atteint → push complet, statut 'success', pas d'interruption", async () => {
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111" }];
        h.catalogSize = 5;
        h.msPerPush = 0; // le temps ne passe pas → jamais d'interruption

        const json = await callCron();

        expect(h.googleFetchCount).toBe(5);
        expect(json.products_pushed).toBe(5);
        expect(json.time_budget_exhausted).toBe(false);
        expect(json.merchants_attempted).toBe(1);
        const upd = h.updates.find((u) => u.id === "m-1")!;
        expect(upd.payload.last_feed_status).toBe("success");
        expect(upd.payload.last_feed_error).toBeNull();
        expect(upd.payload.products_pushed).toBe(5);

        // Non-régression : aucun signal time-budget quand le run finit dans les temps.
        const tbCalls = captureErrorMock.mock.calls.filter(
            (c) => (c[1] as Record<string, unknown> | undefined)?.step === "time-budget",
        );
        expect(tbCalls.length).toBe(0);
    });

    it("budget dépassé en plein marchand → statut 'partial' HONNÊTE (jamais 'success' silencieux)", async () => {
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111" }];
        h.catalogSize = 5;
        // deadline = 1_000_000 + 270_000. 100_000 ms/push → checks à 1.0M,1.1M,1.2M (ok) puis
        // 1.3M ≥ 1.27M → STOP au 4e produit. 3 poussés, 2 non tentés.
        h.msPerPush = 100_000;

        const json = await callCron();

        expect(h.googleFetchCount).toBe(3); // seulement 3 appels réseau, pas 5
        expect(json.products_pushed).toBe(3);
        expect(json.time_budget_exhausted).toBe(true);
        expect(json.merchants_attempted).toBe(1);

        const upd = h.updates.find((u) => u.id === "m-1")!;
        expect(upd.payload.last_feed_status).toBe("partial"); // PAS "success"
        expect(upd.payload.products_pushed).toBe(3);
        expect(String(upd.payload.last_feed_error)).toContain("budget temps");
        expect(String(upd.payload.last_feed_error)).toContain("3/5");
        expect(String(upd.payload.last_feed_error)).toContain("2 non tentés");

        // Pilote MONO-marchand : l'interruption en plein push DOIT quand même alerter Sentry
        // (regression finding #3 : l'ancien garde `< length` ne tirait rien ici).
        const tbCalls = captureErrorMock.mock.calls.filter(
            (c) => (c[1] as Record<string, unknown> | undefined)?.step === "time-budget",
        );
        expect(tbCalls.length).toBe(1);
        expect(String((tbCalls[0][0] as Error).message)).toContain("budget temps épuisé");
    });

    it("budget dépassé → marchand suivant NON démarré + signalé à Sentry (jamais un feed périmé muet)", async () => {
        h.connections = [
            { merchant_id: "m-1", store_code: "twostep-aaaa1111" },
            { merchant_id: "m-2", store_code: "twostep-bbbb2222" },
        ];
        h.catalogSize = 5;
        h.msPerPush = 100_000;

        const json = await callCron();

        // m-1 interrompu → break → m-2 jamais tenté.
        expect(json.merchants).toBe(2);
        expect(json.merchants_attempted).toBe(1);
        expect(json.time_budget_exhausted).toBe(true);

        // m-1 a un statut écrit (partial) ; m-2 n'a AUCUN update (statut du run précédent intact).
        expect(h.updates.some((u) => u.id === "m-1")).toBe(true);
        expect(h.updates.some((u) => u.id === "m-2")).toBe(false);

        // Le marchand non rafraîchi est rendu VISIBLE (Sentry), jamais silencieux.
        const sentryCalls = captureErrorMock.mock.calls.filter(
            (c) => (c[1] as Record<string, unknown> | undefined)?.step === "time-budget",
        );
        expect(sentryCalls.length).toBe(1);
        expect(String((sentryCalls[0][0] as Error).message)).toContain("1/2");
        expect(String((sentryCalls[0][0] as Error).message)).toContain("1 non démarré");
        expect((sentryCalls[0][1] as Record<string, unknown>).merchantsSkipped).toBe(1);
    });
});

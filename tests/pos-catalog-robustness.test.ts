import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shopifyAdapter } from "@/lib/pos/shopify";
import { lightspeedAdapter } from "@/lib/pos/lightspeed";
import { computeOrphanProductIds } from "@/lib/pos/sync-engine";

// Collecte ② — robustesse getCatalog : un catalogue ne doit JAMAIS revenir vide
// silencieusement sur erreur réseau, sinon sync-engine masque toute la vitrine.

// On désactive le back-off retry (POS_RETRY_MAX_RETRIES=0) pour tester la propagation
// d'erreur de façon INSTANTANÉE. La logique de retry elle-même est couverte par
// tests/pos-fetch-retry.test.ts. Ici : un statut non-OK PERSISTANT doit lever, pas [].
beforeEach(() => {
    process.env.POS_RETRY_MAX_RETRIES = "0";
});

afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.POS_RETRY_MAX_RETRIES;
});

function mockFetchOnce(responses: Array<Partial<Response> & { json?: () => unknown; text?: () => string }>) {
    let i = 0;
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
            const r = responses[Math.min(i, responses.length - 1)];
            i++;
            return {
                ok: r.ok ?? true,
                status: r.status ?? 200,
                headers: { get: () => null },
                json: async () => (r.json ? r.json() : {}),
                text: async () => (r.text ? r.text() : ""),
            } as unknown as Response;
        }),
    );
}

describe("Shopify getCatalog — anti catalogue fantôme", () => {
    it("LÈVE sur 429 (rate limit) au lieu de renvoyer []", async () => {
        mockFetchOnce([{ ok: false, status: 429, text: () => "Too Many Requests" }]);
        await expect(
            shopifyAdapter.getCatalog("tok", { shopDomain: "x.myshopify.com" }),
        ).rejects.toThrow(/429/);
    });

    it("LÈVE sur 500", async () => {
        mockFetchOnce([{ ok: false, status: 500, text: () => "boom" }]);
        await expect(
            shopifyAdapter.getCatalog("tok", { shopDomain: "x.myshopify.com" }),
        ).rejects.toThrow(/Shopify products API error 500/);
    });

    it("retourne le catalogue quand la réponse est OK", async () => {
        mockFetchOnce([
            {
                ok: true,
                status: 200,
                json: () => ({
                    products: [
                        {
                            id: 1,
                            title: "T",
                            product_type: "Chaussures",
                            variants: [{ id: 10, title: "Default Title", price: "5.00", barcode: "3000000000001" }],
                        },
                    ],
                }),
            },
        ]);
        const out = await shopifyAdapter.getCatalog("tok", { shopDomain: "x.myshopify.com" });
        expect(out).toHaveLength(1);
        expect(out[0].pos_item_id).toBe("10");
        expect(out[0].ean).toBe("3000000000001");
    });
});

describe("Lightspeed getCatalog — anti catalogue fantôme", () => {
    it("LÈVE si l'appel Account échoue (pas de catalogue vide)", async () => {
        mockFetchOnce([{ ok: false, status: 503 }]);
        await expect(lightspeedAdapter.getCatalog("tok")).rejects.toThrow(/Lightspeed Account API error/);
    });

    it("LÈVE si l'appel Item échoue après un Account OK", async () => {
        mockFetchOnce([
            { ok: true, status: 200, json: () => ({ Account: { accountID: "42" } }) },
            { ok: false, status: 500 },
        ]);
        await expect(lightspeedAdapter.getCatalog("tok")).rejects.toThrow(/Lightspeed Item API error/);
    });
});

describe("computeOrphanProductIds — garde anti-vide", () => {
    const all = [
        { id: "p1", pos_item_id: "a" },
        { id: "p2", pos_item_id: "b" },
        { id: "p3", pos_item_id: null },
    ];

    it("ne masque RIEN si le catalogue courant est vide", () => {
        expect(computeOrphanProductIds(all, new Set())).toEqual([]);
    });

    it("masque uniquement les produits dont le pos_item_id a disparu", () => {
        // 'a' encore présent, 'b' disparu → seul p2 est orphelin (p3 sans pos_item_id ignoré)
        expect(computeOrphanProductIds(all, new Set(["a"]))).toEqual(["p2"]);
    });

    it("ne masque rien si tous les pos_item_id sont toujours là", () => {
        expect(computeOrphanProductIds(all, new Set(["a", "b"]))).toEqual([]);
    });
});

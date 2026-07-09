/**
 * Câblage worker du fix « photo convergée » (2026-07-09) : `enrichOneProduct`
 * re-projette la photo du cache upgradé APRÈS `runCascade` (write-back P0-10),
 * et seulement pour un produit qui a un EAN à ce stade. Sans ce câblage, le
 * helper existe mais le premier enrichissement reste aveugle (le bug réel).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupEanMock = vi.fn(async () => true);
const searchEanByNameMock = vi.fn(async () => null as { ean: string } | null);
const applyConvergedMock = vi.fn(async () => undefined);
const runCascadeMock = vi.fn(async () => ({
    score: 0.985,
    tiers_matched: ["tier2", "tier6"],
    visible: true,
    review_status: "validated",
}));
const findSharedSkuEanMock = vi.fn(async () => null as string | null);

vi.mock("@/lib/ean/lookup", () => ({
    lookupEan: (...a: unknown[]) => lookupEanMock(...(a as [])),
    searchEanByName: (...a: unknown[]) => searchEanByNameMock(...(a as [])),
    applyConvergedCachedPhoto: (...a: unknown[]) => applyConvergedMock(...(a as [])),
}));
const captureErrorMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureErrorMock(...a) }));
vi.mock("@/lib/images/serper", () => ({ searchProductImage: vi.fn(async () => null) }));
vi.mock("@/lib/images/jobs", () => ({ createImageJob: vi.fn(async () => undefined) }));
vi.mock("@/lib/enrichment/cascade-engine", () => ({
    runCascade: (...a: unknown[]) => runCascadeMock(...(a as [])),
}));
vi.mock("@/lib/enrichment/sku-identity", () => ({
    findSharedSkuEan: (...a: unknown[]) => findSharedSkuEanMock(...(a as [])),
}));

import { enrichOneProduct } from "@/lib/enrichment/enrich-product";

const calls: string[] = [];

function fakeAdmin(refreshed: { ean: string | null; name: string; brand: string | null; sku: string | null }) {
    const builder: any = {
        select: () => builder,
        update: (payload: unknown) => {
            calls.push(`update:${JSON.stringify(payload)}`);
            return builder;
        },
        eq: () => builder,
        single: async () => ({ data: refreshed, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
    };
    return { from: () => builder } as any;
}

beforeEach(() => {
    calls.length = 0;
    lookupEanMock.mockClear();
    searchEanByNameMock.mockClear();
    searchEanByNameMock.mockResolvedValue(null);
    applyConvergedMock.mockClear();
    runCascadeMock.mockClear();
    findSharedSkuEanMock.mockClear();
    findSharedSkuEanMock.mockResolvedValue(null);
    captureErrorMock.mockClear();
    applyConvergedMock.mockResolvedValue(undefined);
});

describe("enrichOneProduct — re-projection de la photo convergée", () => {
    it("produit à EAN déclaré : applyConvergedCachedPhoto appelé APRÈS runCascade, avec (ean, productId)", async () => {
        const admin = fakeAdmin({ ean: "3264680011016", name: "Nuxe Huile prodigieuse", brand: null, sku: null });

        await enrichOneProduct(
            { id: "p-1", merchant_id: "m-1", ean: "3264680011016", sku: null, name: "Nuxe Huile prodigieuse", brand: null, review_status: null },
            admin,
        );

        expect(runCascadeMock).toHaveBeenCalledTimes(1);
        expect(applyConvergedMock).toHaveBeenCalledTimes(1);
        expect(applyConvergedMock).toHaveBeenCalledWith("3264680011016", "p-1");
        // Ordre : le verdict de visibilité est écrit AVANT la photo (un hoquet
        // photo ne peut pas perdre la décision de publication).
        expect(applyConvergedMock.mock.invocationCallOrder[0]).toBeGreaterThan(
            runCascadeMock.mock.invocationCallOrder[0],
        );
    });

    it("produit validé : identité tranchée → ni cascade ni re-projection", async () => {
        const admin = fakeAdmin({ ean: "3264680011016", name: "X", brand: null, sku: null });

        await enrichOneProduct(
            { id: "p-1", merchant_id: "m-1", ean: "3264680011016", sku: null, name: "X", brand: null, review_status: "validated" },
            admin,
        );

        expect(runCascadeMock).not.toHaveBeenCalled();
        expect(applyConvergedMock).not.toHaveBeenCalled();
    });

    it("produit sans EAN résolu : rien à re-projeter", async () => {
        const admin = fakeAdmin({ ean: null, name: "Bougie artisanale", brand: null, sku: "BGT-01" });

        await enrichOneProduct(
            { id: "p-2", merchant_id: "m-1", ean: null, sku: "BGT-01", name: "Bougie artisanale", brand: null, review_status: null },
            admin,
        );

        expect(runCascadeMock).toHaveBeenCalledTimes(1);
        expect(applyConvergedMock).not.toHaveBeenCalled();
    });

    it("re-projection qui THROW : capturée, jamais propagée (le verdict écrit ne coûte pas un retry)", async () => {
        applyConvergedMock.mockRejectedValue(new Error("boom réseau"));
        const admin = fakeAdmin({ ean: "3264680011016", name: "Nuxe Huile prodigieuse", brand: null, sku: null });

        await expect(
            enrichOneProduct(
                { id: "p-1", merchant_id: "m-1", ean: "3264680011016", sku: null, name: "Nuxe Huile prodigieuse", brand: null, review_status: null },
                admin,
            ),
        ).resolves.toBeUndefined();

        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });

    it("EAN deviné (SKU partagé) : la re-projection utilise l'EAN adopté", async () => {
        findSharedSkuEanMock.mockResolvedValue("4005900123456");
        const admin = fakeAdmin({ ean: "4005900123456", name: "Produit jumeau", brand: null, sku: "TW-1" });

        await enrichOneProduct(
            { id: "p-3", merchant_id: "m-1", ean: null, sku: "TW-1", name: "Produit jumeau", brand: null, review_status: null },
            admin,
        );

        expect(applyConvergedMock).toHaveBeenCalledWith("4005900123456", "p-3");
    });
});

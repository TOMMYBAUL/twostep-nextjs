import { describe, it, expect } from "vitest";
import { matchProduct, type ProductIndex, type ExistingProduct } from "@/lib/enrichment/match-product";

// Construit un index minimal en mémoire (réplique buildProductIndex sans DB).
function indexOf(products: ExistingProduct[]): ProductIndex {
    const normalize = (s: string) =>
        s.toLowerCase().replace(/[''`\-/().,"]/g, " ").replace(/\s+/g, " ").trim();
    const byPosItemId = new Map<string, ExistingProduct>();
    const byEan = new Map<string, ExistingProduct>();
    const bySku = new Map<string, ExistingProduct>();
    const byName = new Map<string, ExistingProduct>();
    for (const p of products) {
        if (p.pos_item_id) byPosItemId.set(p.pos_item_id, p);
        if (p.ean) byEan.set(p.ean, p);
        if (p.sku) bySku.set(p.sku.toLowerCase(), p);
        if (p.name) byName.set(normalize(p.name), p);
    }
    return { byPosItemId, byEan, bySku, byName, all: products };
}

const base: ExistingProduct = { id: "x", pos_item_id: null, ean: null, sku: null, name: null };

describe("matchProduct — priorités et robustesse", () => {
    it("priorité pos_item_id > ean > sku > name", () => {
        const idx = indexOf([
            { ...base, id: "byPos", pos_item_id: "POS1" },
            { ...base, id: "byEan", ean: "3017620422003" },
        ]);
        expect(matchProduct({ posItemId: "POS1", ean: "3017620422003" }, idx)?.productId).toBe("byPos");
        expect(matchProduct({ ean: "3017620422003" }, idx)?.matchType).toBe("exact_ean");
    });

    it("SKU matché insensible à la casse (REF-001 ↔ ref-001) — anti-doublon", () => {
        const idx = indexOf([{ ...base, id: "p1", sku: "REF-001" }]);
        // Avant le fix : un scan/POS en minuscules ratait le match → doublon.
        expect(matchProduct({ sku: "ref-001" }, idx)?.productId).toBe("p1");
        expect(matchProduct({ sku: "REF-001" }, idx)?.productId).toBe("p1");
        expect(matchProduct({ sku: "Ref-001" }, idx)?.matchType).toBe("exact_sku");
    });

    it("match exact par nom (normalisé : ponctuation/casse)", () => {
        const idx = indexOf([{ ...base, id: "n1", name: "Nike Air-Max 90" }]);
        expect(matchProduct({ name: "nike air max 90" }, idx)?.productId).toBe("n1");
    });

    it("aucun match → null (le caller crée un nouveau produit)", () => {
        const idx = indexOf([{ ...base, id: "p1", sku: "AAA" }]);
        expect(matchProduct({ sku: "ZZZ", ean: "0000000000000" }, idx)).toBeNull();
    });

    it("allowFuzzy:false (POS sync) → pas de match flou risqué", () => {
        const idx = indexOf([{ ...base, id: "p1", name: "Riz Arborio 1kg" }]);
        // Noms proches mais produits distincts : sans fuzzy on ne fusionne pas.
        expect(matchProduct({ name: "Riz Basmati 1kg" }, idx, { allowFuzzy: false })).toBeNull();
    });
});

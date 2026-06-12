import { describe, it, expect } from "vitest";
import { mapStockUpdatesToProducts } from "@/lib/pos/resync-stock";

describe("#14 mapStockUpdatesToProducts — re-sync stock absolu (fix retours)", () => {
    const products = [
        { id: "p1", pos_item_id: "sq-1" },
        { id: "p2", pos_item_id: "sq-2" },
        { id: "p3", pos_item_id: null },
    ];

    it("associe les quantités absolues POS aux bons produits", () => {
        const out = mapStockUpdatesToProducts(products, [
            { pos_item_id: "sq-1", quantity: 7, updated_at: "x" },
            { pos_item_id: "sq-2", quantity: 0, updated_at: "x" },
        ]);
        expect(out).toEqual([
            { productId: "p1", quantity: 7 },
            { productId: "p2", quantity: 0 },
        ]);
    });

    it("corrige une dérive : le POS dit 5 (après retour) → on remet 5", () => {
        // Two-Step affichait 4 (retour non capté) ; le POS absolu dit 5.
        const out = mapStockUpdatesToProducts(products, [
            { pos_item_id: "sq-1", quantity: 5, updated_at: "x" },
        ]);
        expect(out[0]).toEqual({ productId: "p1", quantity: 5 });
    });

    it("ignore un pos_item_id inconnu et clampe les négatifs à 0", () => {
        const out = mapStockUpdatesToProducts(products, [
            { pos_item_id: "inconnu", quantity: 9, updated_at: "x" },
            { pos_item_id: "sq-1", quantity: -3, updated_at: "x" },
        ]);
        expect(out).toEqual([{ productId: "p1", quantity: 0 }]);
    });
});

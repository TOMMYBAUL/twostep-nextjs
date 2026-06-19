import { describe, it, expect } from "vitest";
import { buildPosStockRows } from "@/lib/pos/sync-engine";

/**
 * Régression : le sync catalogue POS doit DÉCLARER source="pos_sync" sur chaque
 * ligne stock. Sinon le DEFAULT 'manual' (migration 104) classe un stock caisse
 * en "Stock probable" au lieu de "Disponible". C'était le seul writer qui omettait
 * la source (webhooks, untracked, resync, file_push la déclaraient déjà).
 */
describe("buildPosStockRows — source tracking du sync catalogue POS (#104)", () => {
    const map = new Map<string, string>([
        ["sq-1", "p1"],
        ["sq-2", "p2"],
    ]);

    it("déclare source=pos_sync et source_ts sur chaque ligne", () => {
        const rows = buildPosStockRows(
            [
                { pos_item_id: "sq-1", quantity: 7, updated_at: "2026-06-19T10:00:00Z" },
                { pos_item_id: "sq-2", quantity: 0, updated_at: "2026-06-19T10:05:00Z" },
            ],
            map,
        );
        expect(rows).toEqual([
            { product_id: "p1", quantity: 7, updated_at: "2026-06-19T10:00:00Z", source: "pos_sync", source_ts: "2026-06-19T10:00:00Z" },
            { product_id: "p2", quantity: 0, updated_at: "2026-06-19T10:05:00Z", source: "pos_sync", source_ts: "2026-06-19T10:05:00Z" },
        ]);
        // Aucune ligne ne doit retomber sur le DEFAULT 'manual'.
        expect(rows.every((r) => r.source === "pos_sync")).toBe(true);
    });

    it("ignore un pos_item_id non mappé (produit non créé)", () => {
        const rows = buildPosStockRows(
            [{ pos_item_id: "inconnu", quantity: 9, updated_at: "x" }],
            map,
        );
        expect(rows).toEqual([]);
    });

    it("source_ts suit updated_at (cohérence de la ligne)", () => {
        const rows = buildPosStockRows(
            [{ pos_item_id: "sq-1", quantity: 3, updated_at: "2026-06-19T12:00:00Z" }],
            map,
        );
        expect(rows[0].source_ts).toBe(rows[0].updated_at);
    });
});

import { describe, it, expect } from "vitest";
import { squareAdapter } from "@/lib/pos/square";
import { shopifyAdapter } from "@/lib/pos/shopify";
import { lightspeedAdapter } from "@/lib/pos/lightspeed";
import { zettleAdapter } from "@/lib/pos/zettle";

/**
 * Collecte ③ — webhooks (chemin stock temps réel).
 *
 * Contrat de FRAÎCHEUR : `parseWebhookEvent` doit reporter l'horodatage RÉEL de
 * l'événement dans `updated_at`. Les routes le transmettent comme `source_ts` à
 * `update_stock_atomic` → (1) confidence "vu il y a X" honnête, (2) garde
 * anti-régression de la migration 104 active sur les flux ABSOLUS (anti-dérive
 * out-of-order). Si un adapter perd ce timestamp, la garde redevient inerte.
 */
describe("Collecte ③ · parseWebhookEvent — mapping quantité + fraîcheur (source_ts)", () => {
    describe("Square (mode absolu)", () => {
        it("mappe la quantité absolue et conserve calculated_at comme updated_at", () => {
            const out = squareAdapter.parseWebhookEvent({
                type: "inventory.count.updated",
                data: {
                    object: {
                        inventory_counts: [
                            { catalog_object_id: "sq-abc", quantity: "3", calculated_at: "2026-06-19T10:00:00Z" },
                        ],
                    },
                },
            });
            expect(out).toEqual([
                { pos_item_id: "sq-abc", quantity: 3, updated_at: "2026-06-19T10:00:00Z" },
            ]);
        });

        it("ignore un type d'événement non géré", () => {
            expect(squareAdapter.parseWebhookEvent({ type: "payment.created" })).toBeNull();
        });
    });

    describe("Zettle (mode absolu)", () => {
        it("mappe le solde absolu et conserve le timestamp de l'événement", () => {
            const out = zettleAdapter.parseWebhookEvent({
                eventName: "InventoryBalanceChanged",
                timestamp: "2026-06-19T10:00:00Z",
                payload: { balanceAfter: [{ variantUuid: "z-1", balance: 4 }] },
            });
            expect(out).toEqual([
                { pos_item_id: "z-1", quantity: 4, updated_at: "2026-06-19T10:00:00Z" },
            ]);
        });

        it("ignore un eventName non géré", () => {
            expect(zettleAdapter.parseWebhookEvent({ eventName: "OrderCreated" })).toBeNull();
        });
    });

    describe("Lightspeed (mode delta — vente)", () => {
        it("mappe la vente en décrément négatif et conserve timeStamp", () => {
            const out = lightspeedAdapter.parseWebhookEvent({
                topic: "sale.completed",
                Sale: { SaleLines: { SaleLine: [{ itemID: "ls-1", qty: "2", timeStamp: "2026-06-19T10:00:00Z" }] } },
            });
            expect(out).toEqual([
                { pos_item_id: "ls-1", quantity: -2, updated_at: "2026-06-19T10:00:00Z" },
            ]);
        });

        it("ignore un topic non géré", () => {
            expect(lightspeedAdapter.parseWebhookEvent({ topic: "sale.opened" })).toBeNull();
        });
    });

    describe("Shopify (mode delta — order)", () => {
        it("reporte l'horodatage RÉEL de l'order (updated_at) dans source_ts, pas l'heure de réception", () => {
            // L'objet order Shopify porte toujours updated_at/created_at (champs cœur de la
            // ressource). Le perdre → faux positif de fraîcheur (cf. maillon 5 garde cosmétique).
            const out = shopifyAdapter.parseWebhookEvent({
                updated_at: "2026-06-19T10:00:00Z",
                created_at: "2026-06-19T09:00:00Z",
                line_items: [{ variant_id: 12345, quantity: 3 }],
            });
            expect(out).toEqual([
                { pos_item_id: "12345", quantity: -3, updated_at: "2026-06-19T10:00:00Z" },
            ]);
        });

        it("retombe sur created_at quand updated_at est absent", () => {
            const out = shopifyAdapter.parseWebhookEvent({
                created_at: "2026-06-19T09:00:00Z",
                line_items: [{ variant_id: 7, quantity: 1 }],
            });
            expect(out![0].updated_at).toBe("2026-06-19T09:00:00Z");
        });

        it("retombe sur processed_at quand updated_at ET created_at sont absents", () => {
            const out = shopifyAdapter.parseWebhookEvent({
                processed_at: "2026-06-19T08:00:00Z",
                line_items: [{ variant_id: 7, quantity: 1 }],
            });
            expect(out![0].updated_at).toBe("2026-06-19T08:00:00Z");
        });

        it("fallback ISO maintenant si l'order ne porte aucun horodatage (≥ ancien comportement)", () => {
            const out = shopifyAdapter.parseWebhookEvent({
                line_items: [{ variant_id: 12345, quantity: 3 }],
            });
            expect(out).not.toBeNull();
            expect(out![0].pos_item_id).toBe("12345");
            expect(out![0].quantity).toBe(-3);
            expect(Number.isNaN(Date.parse(out![0].updated_at))).toBe(false);
        });

        it("ignore un payload sans line_items", () => {
            expect(shopifyAdapter.parseWebhookEvent({ id: 1 })).toBeNull();
        });
    });
});

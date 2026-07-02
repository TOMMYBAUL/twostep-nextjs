import { describe, it, expect } from "vitest";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";
import type { ParsedInvoiceItem } from "@/lib/parser/types";

/**
 * Invariants de COMPLÉTUDE de l'ingestion snapshot (north-star : « aucune source
 * ne perd un produit/qté/prix SANS ALERTE »).
 *
 * On vérifie ici que les deux lectures internes (produits existants + stock en
 * cours) ne MASQUENT PAS une erreur DB :
 *   - lecture des produits existants en échec → on LÈVE (sinon tout le catalogue
 *     serait recréé en doublon, en silence) ;
 *   - lecture du stock en cours en échec → réconciliation ANNULÉE et VISIBLE
 *     (sinon les articles vendus resteraient affichés « en stock » = faux positif).
 *
 * `dryRun: true` exécute les deux lectures sans aucune écriture → on peut tester
 * avec un faux client Supabase minimal.
 */

type QueryResult = { data: unknown; error: { message: string } | null };

/** Faux client admin : un thenable par table, qui résout `select` selon `results`. */
function makeAdmin(results: { products?: QueryResult; stock?: QueryResult }) {
    function builder(table: string) {
        const b: Record<string, unknown> = {};
        const passthrough = () => b;
        // `limit` = pagination keyset fetchAllRows (petit dataset = 1 page → passthrough).
        for (const m of ["select", "eq", "gt", "or", "insert", "update", "upsert", "in", "limit", "order"]) {
            b[m] = passthrough;
        }
        b.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) => {
            let res: QueryResult = { data: [], error: null };
            if (table === "products") res = results.products ?? { data: [], error: null };
            else if (table === "stock") res = results.stock ?? { data: [], error: null };
            // feed_events / enrichment_jobs : jamais atteints en dryRun.
            return Promise.resolve(res).then(resolve, reject);
        };
        return b;
    }
    return { from: (t: string) => builder(t) } as never;
}

const items: ParsedInvoiceItem[] = [
    { name: "Sneaker Model X", ean: null, sku: "REF-001", brand: null, quantity: 5, unit_price: 99 },
];

describe("ingestStockSnapshot — invariants de complétude (lectures non silencieuses)", () => {
    it("LÈVE si la lecture des produits existants échoue (sinon doublons silencieux de tout le catalogue)", async () => {
        const admin = makeAdmin({ products: { data: null, error: { message: "boom-products" } } });
        await expect(
            ingestStockSnapshot("m1", items, admin, { reconcile: true, dryRun: true }),
        ).rejects.toThrow(/produits existants/i);
    });

    it("réconciliation ANNULÉE et VISIBLE si la lecture du stock en cours échoue (anti faux positif « en stock »)", async () => {
        const admin = makeAdmin({
            products: { data: [], error: null },
            stock: { data: null, error: { message: "boom-stock" } },
        });
        const r = await ingestStockSnapshot("m1", items, admin, { reconcile: true, dryRun: true });
        expect(r.reconcile_skipped).toBe(true);
        expect(r.stock_zeroed).toBe(0);
        expect(r.errors.some((e) => /lecture du stock/i.test(e))).toBe(true);
    });

    it("happy path : réconciliation calcule les produits à passer à 0 (dryRun, sans écriture)", async () => {
        const admin = makeAdmin({
            products: { data: [], error: null },
            // "old1" est en stock mais ABSENT du push → passerait à 0.
            stock: { data: [{ product_id: "old1", quantity: 3 }], error: null },
        });
        const r = await ingestStockSnapshot("m1", items, admin, { reconcile: true, dryRun: true });
        expect(r.dry_run).toBe(true);
        expect(r.reconcile_skipped).toBe(false);
        expect(r.products_created).toBe(1);
        expect(r.stock_zeroed).toBe(1);
        expect(r.errors).toEqual([]);
    });
});

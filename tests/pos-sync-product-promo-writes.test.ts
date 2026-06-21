import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

import { updateProduct, upsertPromo, type SyncResult } from "@/lib/pos/sync-engine";
import { captureError } from "@/lib/error";
import type { POSProduct, POSPromo } from "@/lib/pos";

/**
 * Couverture des deux WRITES par-produit de `syncMerchantPOS` qui restaient SILENCIEUX
 * (erreur avalée + compteur menteur) — enjeu north-star « ne rien perdre/mentir sans alerte » :
 *
 * - `updateProduct` : l'update produit (nom/prix/ean/photo) avalait son `error` et le
 *   caller posait `products_updated = toUpdate.length` même en échec → dérive de prix/nom
 *   rapportée « mise à jour ». Désormais : renvoie un booléen (le caller ne compte que les
 *   succès) + REMONTE l'échec via captureError. Non bloquant (une ligne fautive ne fige pas
 *   le marchand entier).
 * - `upsertPromo` : l'upsert promo avalait son `error` puis incrémentait `promos_imported`
 *   → compteur menteur (promo non écrite comptée comme importée). Idem pour la lecture du
 *   prix. Désormais : on ne compte que les upserts réussis + on REMONTE les échecs.
 */

type State = { table: string; op: string; payload: unknown; filters: Record<string, unknown>; single: boolean };
type QueryResult = { data: unknown; error: { message: string } | null };
type Capture = { table: string; op: string; payload: unknown; filters: Record<string, unknown> };

/** Faux client : `resolveRead` répond aux SELECT ; les écritures sont capturées et peuvent échouer par table. */
function makeClient(resolveRead: (table: string, state: State) => QueryResult, writeErrors?: Record<string, boolean>) {
    const captures: Capture[] = [];
    function builder(table: string) {
        const state: State = { table, op: "select", payload: undefined, filters: {}, single: false };
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.update = (p: unknown) => ((state.op = "update"), (state.payload = p), b);
        b.upsert = (p: unknown) => ((state.op = "upsert"), (state.payload = p), b);
        b.eq = (c: string, v: unknown) => ((state.filters[c] = v), b);
        b.in = (c: string, v: unknown) => ((state.filters[c] = v), b);
        b.single = () => ((state.single = true), b);
        b.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) => {
            let res: QueryResult;
            if (state.op === "select") {
                res = resolveRead(table, state);
            } else {
                captures.push({ table, op: state.op, payload: state.payload, filters: { ...state.filters } });
                res = writeErrors?.[table] ? { data: null, error: { message: `boom-${table}` } } : { data: null, error: null };
            }
            return Promise.resolve(res).then(resolve, reject);
        };
        return b;
    }
    return { client: { from: (t: string) => builder(t) } as never, captures };
}

const posProduct = (over: Partial<POSProduct> = {}): POSProduct => ({
    pos_item_id: "item-1",
    name: "Nike Air",
    ean: "3001234567890",
    price: 120,
    category: "shoes",
    photo_url: "http://img/x.jpg",
    ...over,
});

const newResult = (): SyncResult => ({
    products_created: 0,
    products_updated: 0,
    stock_updated: 0,
    promos_imported: 0,
    products_enriched: 0,
    pos_items_total: 0,
    visible_count: 0,
});

beforeEach(() => (captureError as ReturnType<typeof vi.fn>).mockClear());

describe("updateProduct — update produit non silencieux + compteur honnête", () => {
    it("succès → renvoie true, écrit le bon payload, aucun captureError", async () => {
        const { client, captures } = makeClient(() => ({ data: null, error: null }));
        const ok = await updateProduct(client, "p1", "http://old.jpg", "square", posProduct());
        expect(ok).toBe(true);
        expect(captures).toHaveLength(1);
        expect(captures[0].table).toBe("products");
        expect(captures[0].filters.id).toBe("p1");
        expect((captures[0].payload as Record<string, unknown>).price).toBe(120);
        expect(captureError).not.toHaveBeenCalled();
    });

    it("échec d'écriture → renvoie false + REMONTE (captureError), sans lever", async () => {
        const { client } = makeClient(() => ({ data: null, error: null }), { products: true });
        const ok = await updateProduct(client, "p1", null, "square", posProduct());
        expect(ok).toBe(false);
        expect(captureError).toHaveBeenCalledTimes(1);
        expect((captureError as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({
            context: "pos-sync-update-product",
            productId: "p1",
        });
    });
});

describe("upsertPromo — promo non silencieuse + promos_imported honnête", () => {
    const promo = (over: Partial<POSPromo> = {}): POSPromo => ({
        pos_promo_id: "promo-1",
        name: "Soldes",
        type: "percentage",
        value: 20,
        product_ids: ["item-1"],
        starts_at: null,
        ends_at: null,
        ...over,
    });

    it("succès : calcule sale_price, upsert la promo, incrémente promos_imported", async () => {
        const { client, captures } = makeClient((table, state) =>
            table === "products" && state.single ? { data: { price: 100 }, error: null } : { data: null, error: null },
        );
        const result = newResult();
        await upsertPromo(client, "m1", "square", promo(), new Map([["item-1", "P1"]]), new Map(), result);
        const up = captures.find((c) => c.table === "promotions" && c.op === "upsert");
        expect(up).toBeDefined();
        // -20% de 100 = 80.
        expect((up!.payload as Record<string, unknown>).sale_price).toBe(80);
        expect(result.promos_imported).toBe(1);
        expect(captureError).not.toHaveBeenCalled();
    });

    it("échec de l'upsert promo → NE compte PAS (promos_imported reste 0) + REMONTE", async () => {
        const { client } = makeClient(
            (table, state) => (table === "products" && state.single ? { data: { price: 100 }, error: null } : { data: null, error: null }),
            { promotions: true },
        );
        const result = newResult();
        await upsertPromo(client, "m1", "square", promo(), new Map([["item-1", "P1"]]), new Map(), result);
        expect(result.promos_imported).toBe(0);
        expect(captureError).toHaveBeenCalledTimes(1);
        expect((captureError as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ context: "pos-sync-upsert-promo" });
    });

    it("échec de la LECTURE du prix → skip (promos_imported 0) + REMONTE, sans lever", async () => {
        const { client, captures } = makeClient((table, state) =>
            table === "products" && state.single ? { data: null, error: { message: "read boom" } } : { data: null, error: null },
        );
        const result = newResult();
        await upsertPromo(client, "m1", "square", promo(), new Map([["item-1", "P1"]]), new Map(), result);
        expect(result.promos_imported).toBe(0);
        expect(captures.find((c) => c.table === "promotions")).toBeUndefined();
        expect((captureError as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ context: "pos-sync-upsert-promo-read" });
    });

    it("expansion parent→variantes (Shopify) : résout le parent en variantes connues", async () => {
        const { client, captures } = makeClient((table, state) =>
            table === "products" && state.single ? { data: { price: 50 }, error: null } : { data: null, error: null },
        );
        const result = newResult();
        // promo cible le PARENT "par-1" ; posParentToVariants l'étend en ["item-a"].
        await upsertPromo(
            client,
            "m1",
            "shopify",
            promo({ product_ids: ["par-1"], type: "fixed_amount", value: 10 }),
            new Map([["item-a", "P_A"]]),
            new Map([["par-1", ["item-a"]]]),
            result,
        );
        const up = captures.find((c) => c.table === "promotions" && c.op === "upsert");
        // fixed_amount -10 sur 50 = 40, ciblant le produit de la variante.
        expect((up!.payload as Record<string, unknown>).sale_price).toBe(40);
        expect((up!.payload as Record<string, unknown>).product_id).toBe("P_A");
        expect(result.promos_imported).toBe(1);
    });
});

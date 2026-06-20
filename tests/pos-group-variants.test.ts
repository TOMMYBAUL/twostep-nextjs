import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

import { groupVariantsByEAN, recalculateGroupSizes } from "@/lib/pos/sync-engine";
import { captureError } from "@/lib/error";

/**
 * Couverture du dernier gros WRITE non testé du sync POS : `groupVariantsByEAN`
 * (post-pass appelé par l'ingestion ET le sync POS) + `recalculateGroupSizes`.
 *
 * ENJEU n°1 — le GATE « zéro faux positif » : ce post-pass décide quels produits
 * deviennent VISIBLES. LESSONS documente un bug réel ici (il rendait visibles les
 * `pending`/`masked` du gate cascade → court-circuit du « zéro faux positif »).
 * On VERROUILLE l'invariant : seul `validated` (ou NULL legacy) peut devenir visible,
 * stock > 0 requis ; tout statut pipeline (`pending`/`masked`/`pending_review`) reste
 * caché MÊME avec du stock. + le regroupage par préfixe EAN (élection du principal,
 * available_sizes, marquage des variantes).
 */

type State = {
    table: string;
    op: "select" | "update" | "upsert" | "insert";
    payload: any;
    filters: Record<string, unknown>;
    single: boolean;
};
type Capture = { table: string; op: string; payload: any; filters: Record<string, unknown> };
type QueryResult = { data: unknown; error: { message: string } | null };

/**
 * Faux client : `resolveRead` répond aux SELECT ; toute écriture (update/upsert/insert)
 * est CAPTURÉE pour assertion et résout {error:null}.
 */
function makeClient(resolveRead: (table: string, state: State) => QueryResult, writeErrors?: { products?: boolean; stock?: boolean }) {
    const captures: Capture[] = [];
    function builder(table: string) {
        const state: State = { table, op: "select", payload: undefined, filters: {}, single: false };
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.update = (p: unknown) => {
            state.op = "update";
            state.payload = p;
            return b;
        };
        b.upsert = (p: unknown) => {
            state.op = "upsert";
            state.payload = p;
            return b;
        };
        b.insert = (p: unknown) => {
            state.op = "insert";
            state.payload = p;
            return b;
        };
        b.eq = (c: string, v: unknown) => {
            state.filters[c] = v;
            return b;
        };
        b.is = () => b;
        b.or = () => b;
        b.in = (c: string, v: unknown) => {
            state.filters[c] = v;
            return b;
        };
        b.single = () => {
            state.single = true;
            return b;
        };
        b.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) => {
            let res: QueryResult;
            if (state.op === "select") {
                res = resolveRead(table, state);
            } else {
                captures.push({ table, op: state.op, payload: state.payload, filters: state.filters });
                const failed = (table === "products" && writeErrors?.products) || (table === "stock" && writeErrors?.stock);
                res = failed ? { data: null, error: { message: `boom-${table}` } } : { data: null, error: null };
            }
            return Promise.resolve(res).then(resolve, reject);
        };
        return b;
    }
    return { client: { from: (t: string) => builder(t) } as never, captures };
}

/** Trouve la payload d'un update produit ciblant `id` (filtre .eq("id", id)). */
function updatePayloadFor(captures: Capture[], id: string): any {
    return captures.find((c) => c.table === "products" && c.op === "update" && c.filters.id === id)?.payload;
}

describe("groupVariantsByEAN — GATE visibilité « zéro faux positif » (sans EAN)", () => {
    it("ne rend JAMAIS visible un produit pending/masked/pending_review, même avec stock > 0", async () => {
        const products = [
            { id: "pend", name: "Pending Prod", ean: null, size: null, review_status: "pending_review", stock: [{ quantity: 5 }] },
            { id: "val", name: "Valid Prod", ean: null, size: null, review_status: "validated", stock: [{ quantity: 5 }] },
            { id: "leg", name: "Legacy Prod", ean: null, size: null, review_status: null, stock: [{ quantity: 2 }] },
            { id: "zero", name: "Zero Stock", ean: null, size: null, review_status: "validated", stock: [{ quantity: 0 }] },
            { id: "masked", name: "Masked Prod", ean: null, size: null, review_status: "masked", stock: [{ quantity: 9 }] },
        ];
        const { client, captures } = makeClient((table) =>
            table === "products" ? { data: products, error: null } : { data: [], error: null },
        );

        const visibleCount = await groupVariantsByEAN(client, "m1");

        // Le gate : pipeline non-validé reste caché malgré le stock.
        expect(updatePayloadFor(captures, "pend").visible).toBe(false);
        expect(updatePayloadFor(captures, "masked").visible).toBe(false);
        // validated + stock>0 → visible ; NULL = legacy validated → visible.
        expect(updatePayloadFor(captures, "val").visible).toBe(true);
        expect(updatePayloadFor(captures, "leg").visible).toBe(true);
        // stock 0 → invisible même validated.
        expect(updatePayloadFor(captures, "zero").visible).toBe(false);

        expect(visibleCount).toBe(2);
    });

    it("n'écrase pas available_sizes avec du vide quand le produit n'a pas de size", async () => {
        const products = [{ id: "nosize", name: "No Size", ean: null, size: null, review_status: "validated", stock: [{ quantity: 3 }] }];
        const { client, captures } = makeClient((table) =>
            table === "products" ? { data: products, error: null } : { data: [], error: null },
        );
        await groupVariantsByEAN(client, "m1");
        const payload = updatePayloadFor(captures, "nosize");
        expect(payload.visible).toBe(true);
        // Non-destructif : pas de clé available_sizes posée (sinon écraserait l'ingestion fichier).
        expect("available_sizes" in payload).toBe(false);
    });
});

describe("groupVariantsByEAN — regroupage par préfixe EAN", () => {
    it("élit le principal (photo prioritaire), agrège les tailles, totalise le stock, marque les variantes", async () => {
        // Même préfixe 12 chars "300123456789" (la dernière digit = checksum, ignorée).
        const products = [
            {
                id: "v-nophoto",
                name: "Shoe 42",
                ean: "3001234567890",
                size: "42",
                photo_url: null,
                photo_processed_url: null,
                created_at: "2026-01-01",
                review_status: "validated",
                stock: [{ quantity: 2 }],
            },
            {
                id: "v-photo",
                name: "Shoe 43",
                ean: "3001234567897",
                size: "43",
                photo_url: "http://img/x.jpg",
                photo_processed_url: null,
                created_at: "2026-02-01",
                review_status: "validated",
                stock: [{ quantity: 3 }],
            },
        ];
        const { client, captures } = makeClient((table) =>
            table === "products" ? { data: products, error: null } : { data: [], error: null },
        );

        const visibleCount = await groupVariantsByEAN(client, "m1");

        // Principal = celui AVEC photo.
        const principal = updatePayloadFor(captures, "v-photo");
        expect(principal.visible).toBe(true);
        expect(principal.variant_of).toBeNull();
        expect(principal.available_sizes).toEqual([
            { size: "42", quantity: 2, source: "pos" },
            { size: "43", quantity: 3, source: "pos" },
        ]);

        // Le principal reçoit le stock TOTAL du groupe.
        const stockUpsert = captures.find((c) => c.table === "stock" && c.op === "upsert" && c.payload.product_id === "v-photo");
        expect(stockUpsert?.payload.quantity).toBe(5);

        // La variante est marquée variant_of=principal + invisible (via .in).
        const variantUpd = captures.find(
            (c) => c.table === "products" && c.op === "update" && Array.isArray(c.filters.id) && (c.filters.id as string[]).includes("v-nophoto"),
        );
        expect(variantUpd?.payload).toEqual({ variant_of: "v-photo", visible: false });

        // Un seul groupe visible.
        expect(visibleCount).toBe(1);
    });

    it("produit EAN solo : visible seulement si stock > 0, variant_of remis à null", async () => {
        const products = [
            { id: "solo0", name: "Solo Zero", ean: "4001234567890", size: null, photo_url: null, photo_processed_url: null, created_at: "2026-01-01", review_status: "validated", stock: [{ quantity: 0 }] },
            { id: "solo1", name: "Solo One", ean: "5001234567890", size: null, photo_url: null, photo_processed_url: null, created_at: "2026-01-01", review_status: "validated", stock: [{ quantity: 4 }] },
        ];
        const { client, captures } = makeClient((table) =>
            table === "products" ? { data: products, error: null } : { data: [], error: null },
        );
        const visibleCount = await groupVariantsByEAN(client, "m1");
        expect(updatePayloadFor(captures, "solo0").visible).toBe(false);
        expect(updatePayloadFor(captures, "solo1").visible).toBe(true);
        expect(updatePayloadFor(captures, "solo1").variant_of).toBeNull();
        expect(visibleCount).toBe(1);
    });

    it("retourne 0 et n'écrit rien si aucun produit", async () => {
        const { client, captures } = makeClient(() => ({ data: [], error: null }));
        const visibleCount = await groupVariantsByEAN(client, "m1");
        expect(visibleCount).toBe(0);
        expect(captures).toEqual([]);
    });
});

describe("recalculateGroupSizes — recalcul available_sizes + stock du principal", () => {
    /** Résout les 2 reads : .single() → la ligne produit ; sinon → les membres du groupe. */
    function readResolver(product: unknown, members: unknown[]) {
        return (table: string, state: State): QueryResult => {
            if (table !== "products") return { data: [], error: null };
            return state.single ? { data: product, error: null } : { data: members, error: null };
        };
    }

    it("résout le principal via variant_of, agrège tailles+stock sur le principal", async () => {
        const { client, captures } = makeClient(
            readResolver({ id: "var1", variant_of: "princ" }, [
                { id: "princ", size: "42", stock: [{ quantity: 1 }] },
                { id: "var1", size: "43", stock: [{ quantity: 4 }] },
            ]),
        );

        await recalculateGroupSizes(client, "var1");

        const upd = updatePayloadFor(captures, "princ");
        expect(upd.available_sizes).toEqual([
            { size: "42", quantity: 1, source: "pos" },
            { size: "43", quantity: 4, source: "pos" },
        ]);
        const stockUpsert = captures.find((c) => c.table === "stock" && c.op === "upsert" && c.payload.product_id === "princ");
        expect(stockUpsert?.payload.quantity).toBe(5);
    });

    it("BUG FIX — produit SOLO sans size : ne clobbe NI le stock autoritaire NI available_sizes (anti faux rupture)", async () => {
        // Régression du bug réel : un webhook pose le stock à N via updateStockAtomic, puis
        // ce recalc le RÉÉCRIVAIT à 0 (total des tailles, vide) → faux « rupture » silencieux.
        // Le jumeau de prod `recalculateGroupSizesAdmin` (appelé par les 4 webhooks) partage
        // EXACTEMENT cette logique → ce test verrouille l'invariant des deux.
        const { client, captures } = makeClient(readResolver({ id: "princ", variant_of: null }, [{ id: "princ", size: null, stock: [{ quantity: 7 }] }]));
        await recalculateGroupSizes(client, "princ");
        // Aucune écriture du tout : le stock posé par le webhook (7) reste intact.
        expect(captures).toEqual([]);
    });

    it("produit introuvable → ne fait rien", async () => {
        const { client, captures } = makeClient((table, state) =>
            table === "products" && state.single ? { data: null, error: null } : { data: [], error: null },
        );
        await recalculateGroupSizes(client, "ghost");
        expect(captures).toEqual([]);
    });

    it("un échec d'écriture du rollup est REMONTÉ (Sentry), pas avalé en silence", async () => {
        const reads = readResolver({ id: "princ", variant_of: null }, [
            { id: "princ", size: "42", stock: [{ quantity: 1 }] },
            { id: "var1", size: "43", stock: [{ quantity: 4 }] },
        ]);
        const { client } = makeClient(reads, { products: true, stock: true });
        await recalculateGroupSizes(client, "princ");
        // Les deux writes échouent → 2 captureError (available_sizes + stock_total), 0 silence.
        expect(captureError).toHaveBeenCalledTimes(2);
        const writes = (captureError as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[1] as { write: string }).write);
        expect(writes).toContain("available_sizes");
        expect(writes).toContain("stock_total");
    });
});

beforeEach(() => {
    (captureError as ReturnType<typeof vi.fn>).mockClear();
});

import { describe, it, expect } from "vitest";
import { applyStockUpserts, hideOrphanProducts, type PosStockRow } from "@/lib/pos/sync-engine";

/**
 * Couverture des WRITES non silencieux extraits de `syncMerchantPOS` (l'orchestrateur
 * du sync POS catalogue, le dernier gros hot path dont les écritures n'étaient pas
 * testées). Enjeu north-star « ne rien perdre sans alerte » :
 *
 * - `applyStockUpserts` : l'upsert stock batch avalait l'erreur ET posait
 *   `stock_updated = rows.length` même en échec → un stock NON persisté rapporté
 *   « success » = faux positif n°1 (vendu affiché en stock). On VERROUILLE : toute
 *   erreur d'écriture LÈVE (le catch du sync marque `error` + Sentry) et le compteur
 *   reflète le réel.
 * - `hideOrphanProducts` : le masquage des produits retirés du POS avalait l'erreur
 *   → produit retiré resté visible en silence = catalogue fantôme. On VERROUILLE :
 *   l'échec LÈVE, et jamais d'`.in("id", [])` quand il n'y a rien à masquer.
 */

type Capture = { table: string; op: string; payload: unknown; opts: unknown; filters: Record<string, unknown> };

/**
 * Faux client : capture toute écriture (upsert/update) et résout {error}. `failOn`
 * permet d'injecter une erreur DB sur un appel ciblé (table + n° d'appel terminal).
 */
function makeClient(failOn?: (cap: Capture, callIndex: number) => boolean) {
    const captures: Capture[] = [];
    function builder(table: string) {
        const state: Capture = { table, op: "select", payload: undefined, opts: undefined, filters: {} };
        const b: Record<string, unknown> = {};
        b.upsert = (p: unknown, opts: unknown) => {
            state.op = "upsert";
            state.payload = p;
            state.opts = opts;
            return b;
        };
        b.update = (p: unknown) => {
            state.op = "update";
            state.payload = p;
            return b;
        };
        b.eq = (c: string, v: unknown) => {
            state.filters[c] = v;
            return b;
        };
        b.in = (c: string, v: unknown) => {
            state.filters[c] = v;
            return b;
        };
        b.then = (resolve: (v: { data: null; error: { message: string } | null }) => unknown, reject: (e: unknown) => unknown) => {
            const callIndex = captures.length;
            captures.push({ ...state });
            const failed = failOn?.({ ...state }, callIndex) ?? false;
            const res = failed ? { data: null, error: { message: `boom-${state.table}` } } : { data: null, error: null };
            return Promise.resolve(res).then(resolve, reject);
        };
        return b;
    }
    return { client: { from: (t: string) => builder(t) } as never, captures };
}

const row = (id: string, qty: number): PosStockRow => ({
    product_id: id,
    quantity: qty,
    updated_at: "2026-06-20T10:00:00Z",
    source: "pos_sync",
    source_ts: "2026-06-20T10:00:00Z",
});

describe("applyStockUpserts — upsert stock non silencieux", () => {
    it("écrit toutes les lignes (1 lot) sur la table stock et renvoie le compte", async () => {
        const { client, captures } = makeClient();
        const rows = [row("p1", 3), row("p2", 0)];
        const n = await applyStockUpserts(client, rows);
        expect(n).toBe(2);
        expect(captures).toHaveLength(1);
        expect(captures[0].table).toBe("stock");
        expect(captures[0].op).toBe("upsert");
        expect(captures[0].payload).toEqual(rows);
        expect(captures[0].opts).toEqual({ onConflict: "product_id" });
    });

    it("découpe en lots de 500 (batchSize respecté, aucune ligne perdue)", async () => {
        const { client, captures } = makeClient();
        const rows = Array.from({ length: 501 }, (_, i) => row(`p${i}`, 1));
        const n = await applyStockUpserts(client, rows);
        expect(n).toBe(501);
        // 501 lignes → 2 lots (500 + 1)
        expect(captures).toHaveLength(2);
        expect((captures[0].payload as PosStockRow[]).length).toBe(500);
        expect((captures[1].payload as PosStockRow[]).length).toBe(1);
        // L'union des deux lots = toutes les lignes, sans perte ni doublon.
        const written = [...(captures[0].payload as PosStockRow[]), ...(captures[1].payload as PosStockRow[])];
        expect(written).toEqual(rows);
    });

    it("LÈVE si une écriture stock échoue (jamais un faux « success » avec stock périmé)", async () => {
        const { client } = makeClient((cap) => cap.table === "stock");
        await expect(applyStockUpserts(client, [row("p1", 5)])).rejects.toThrow(/stock upsert failed/);
    });

    it("LÈVE dès le PREMIER lot en échec (n'avale pas une perte partielle)", async () => {
        // 600 lignes = 2 lots ; on fait échouer le 2e → doit lever malgré le 1er OK.
        const { client } = makeClient((_cap, i) => i === 1);
        const rows = Array.from({ length: 600 }, (_, i) => row(`p${i}`, 1));
        await expect(applyStockUpserts(client, rows)).rejects.toThrow(/stock upsert failed/);
    });

    it("liste vide → aucun appel d'écriture, renvoie 0", async () => {
        const { client, captures } = makeClient();
        const n = await applyStockUpserts(client, []);
        expect(n).toBe(0);
        expect(captures).toHaveLength(0);
    });
});

describe("hideOrphanProducts — réconciliation non silencieuse", () => {
    it("masque (visible:false) les ids orphelins via .in(\"id\", ids)", async () => {
        const { client, captures } = makeClient();
        await hideOrphanProducts(client, ["a", "b", "c"]);
        expect(captures).toHaveLength(1);
        expect(captures[0].table).toBe("products");
        expect(captures[0].op).toBe("update");
        expect(captures[0].payload).toEqual({ visible: false });
        expect(captures[0].filters.id).toEqual(["a", "b", "c"]);
    });

    it("LÈVE si le masquage échoue (jamais un produit retiré resté visible en silence)", async () => {
        const { client } = makeClient((cap) => cap.table === "products");
        await expect(hideOrphanProducts(client, ["a"])).rejects.toThrow(/orphan hide failed/);
    });

    it("liste vide → aucune écriture (jamais d'.in(\"id\", []) qui matcherait tout/rien)", async () => {
        const { client, captures } = makeClient();
        await hideOrphanProducts(client, []);
        expect(captures).toHaveLength(0);
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

import { normalizeStockWriteResult, updateStockAtomic } from "@/lib/pos/update-stock";

beforeEach(() => captureMock.mockClear());

/**
 * P0-6 — le wrapper `updateStockAtomic` normalise le retour du RPC `update_stock_atomic` en
 * {previous, written}, en tolérant les DEUX formes → le code est sûr AVANT comme APRÈS
 * l'application de la migration 110 :
 *  - RPC pré-110 (`RETURNS int`) → scalaire → `written=true` par défaut (comportement actuel).
 *  - RPC 110 (`RETURNS TABLE`) → PostgREST renvoie `[{previous, written}]` (ou un objet).
 * Toute forme inattendue retombe sur le défaut conservateur (ne jamais SUPPRIMER un événement
 * légitime sur une forme non reconnue).
 */

describe("normalizeStockWriteResult — tolérance de forme (pré/post migration 110)", () => {
    it("scalaire (RPC pré-110 RETURNS int) → {previous:n, written:true} (comportement actuel préservé)", () => {
        expect(normalizeStockWriteResult(5)).toEqual({ previous: 5, written: true });
        expect(normalizeStockWriteResult(0)).toEqual({ previous: 0, written: true });
    });

    it("null/undefined → {previous:0, written:true} (défaut conservateur)", () => {
        expect(normalizeStockWriteResult(null)).toEqual({ previous: 0, written: true });
        expect(normalizeStockWriteResult(undefined)).toEqual({ previous: 0, written: true });
    });

    it("tableau [{previous, written}] (RPC 110 set-returning) → destructuré", () => {
        expect(normalizeStockWriteResult([{ previous: 7, written: false }])).toEqual({ previous: 7, written: false });
        expect(normalizeStockWriteResult([{ previous: 3, written: true }])).toEqual({ previous: 3, written: true });
    });

    it("objet {previous, written} (forme single-row) → destructuré", () => {
        expect(normalizeStockWriteResult({ previous: 2, written: false })).toEqual({ previous: 2, written: false });
    });

    it("forme inattendue → défaut conservateur (previous:0, written:true) + captureError (observable, pas de skip silencieux)", () => {
        for (const bad of ["weird", {}, [{}], [null], true]) {
            captureMock.mockClear();
            expect(normalizeStockWriteResult(bad)).toEqual({ previous: 0, written: true });
            // Le garde P0-6 ne doit pas s'éteindre EN SILENCE si le RPC renvoie une forme inconnue.
            expect(captureMock).toHaveBeenCalledTimes(1);
        }
    });

    it("formes ATTENDUES (scalaire, null, {previous,written}) → PAS d'alerte captureError", () => {
        for (const ok of [5, 0, null, undefined, [{ previous: 7, written: false }], { previous: 2, written: true }]) {
            captureMock.mockClear();
            normalizeStockWriteResult(ok);
            expect(captureMock).not.toHaveBeenCalled();
        }
    });
});

describe("updateStockAtomic — appel RPC + propagation d'erreur", () => {
    function fakeClient(rpcResult: { data: unknown; error: unknown }) {
        return {
            rpc: vi.fn(async () => rpcResult),
        } as any;
    }

    it("happy (RPC 110) → {previous, written}", async () => {
        const client = fakeClient({ data: [{ previous: 9, written: true }], error: null });
        const r = await updateStockAtomic(client, "prod-1", -1, "delta", "webhook", "2026-07-06T10:00:00Z");
        expect(r).toEqual({ previous: 9, written: true });
        expect(client.rpc).toHaveBeenCalledWith("update_stock_atomic", {
            p_product_id: "prod-1",
            p_quantity: -1,
            p_mode: "delta",
            p_source: "webhook",
            p_source_ts: "2026-07-06T10:00:00Z",
        });
    });

    it("sans sourceTs → p_source_ts OMIS (le DEFAULT now() de la RPC s'applique)", async () => {
        const client = fakeClient({ data: 5, error: null });
        await updateStockAtomic(client, "prod-1", 3, "absolute", "manual");
        const args = client.rpc.mock.calls[0][1];
        expect(args).not.toHaveProperty("p_source_ts");
    });

    it("erreur RPC → THROW (jamais un faux succès silencieux)", async () => {
        const client = fakeClient({ data: null, error: { message: "rpc down" } });
        await expect(updateStockAtomic(client, "prod-1", 1, "delta")).rejects.toThrow(/update_stock_atomic failed: rpc down/);
    });
});

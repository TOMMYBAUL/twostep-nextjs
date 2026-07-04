import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A1 — `pushInventoryToGoogle(merchantId, productIds)` : ciblage + expansion PRINCIPAL.
 *
 * Le push ciblé (webhooks) ne doit pousser QUE les produits touchés — mais quand le
 * produit touché est une VARIANTE de taille, son stock est roulé sur le PRINCIPAL du
 * groupe (`recalculateGroupSizesAdmin`) et la requête inventory filtre
 * `variant_of IS NULL` : cibler la variante seule ne pousserait RIEN alors que l'état
 * Google du principal vient de changer (un vendu resté « in stock » = faux positif n°1).
 *
 * Contrat verrouillé :
 *  1. productIds=[variante] → la requête finale cible le PRINCIPAL (`variant_of ?? id`),
 *     et SEUL ce produit part vers Google (pas le catalogue entier).
 *  2. productIds=[solo] → cible le produit lui-même.
 *  3. Deux variantes du même groupe → UN seul id principal (dédup).
 *  4. Échec de la lecture d'expansion → repli CONSERVATEUR sur le push COMPLET
 *     (jamais laisser Google périmé en silence sur un blip) + captureError.
 *  5. Produits touchés introuvables (supprimés) → return, AUCUN push (surtout pas
 *     un push complet via une liste vide).
 *  6. Sans productIds (chemin sync) → PAS de requête d'expansion, push complet
 *     inchangé (protège `syncMerchantPOS`).
 */

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

const googleFetch = vi.fn(async () => ({}));
vi.mock("@/lib/google/merchant", () => ({
    getGoogleAccessToken: async () => ({
        connection: { google_merchant_id: "gm-1", store_code: "store-1" },
        accessToken: "tok",
    }),
    googleMerchantFetch: (...a: unknown[]) => googleFetch(...a),
}));

// ─── Faux client admin : discrimine la requête d'EXPANSION (select "id, variant_of")
//     de la requête CATALOGUE (select "id, ean, stock(...)"), enregistre les `.in()`. ───
type Row = Record<string, unknown>;
let expansionResult: { data: Row[] | null; error: { message: string } | null };
let catalogRows: Row[];
let recorded: { expansionInIds: string[] | null; mainInIds: Array<string[] | null>; mainQueries: number };

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (_table: string) => ({
            select: (cols: string) => {
                if (cols.includes("variant_of")) {
                    // Requête d'expansion : .in("id", ids) est AWAITÉE directement.
                    return {
                        in: (_col: string, ids: string[]) => {
                            recorded.expansionInIds = ids;
                            return Promise.resolve(expansionResult);
                        },
                    };
                }
                // Requête catalogue (paginée par fetchAllRows : .gt/.limit).
                const state: { inIds: string[] | null } = { inIds: null };
                const b: Record<string, unknown> = {};
                const chain = () => b;
                Object.assign(b, {
                    eq: chain,
                    is: chain,
                    not: chain,
                    gt: chain,
                    order: chain,
                    in: (_col: string, ids: string[]) => {
                        state.inIds = ids;
                        return b;
                    },
                    limit: async () => {
                        recorded.mainQueries++;
                        recorded.mainInIds.push(state.inIds);
                        const rows = state.inIds ? catalogRows.filter((r) => state.inIds!.includes(r.id as string)) : catalogRows;
                        return { data: rows, error: null };
                    },
                });
                return b;
            },
        }),
    }),
}));

import { pushInventoryToGoogle } from "@/lib/google/inventory";

const NOW = new Date().toISOString();
const stockRow = { quantity: 3, source: "webhook", source_ts: NOW, updated_at: NOW };

function pushedProductIds(): string[] {
    return googleFetch.mock.calls.map((c) => {
        const body = JSON.parse((c[2] as { body: string }).body);
        return body.productId as string;
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    recorded = { expansionInIds: null, mainInIds: [], mainQueries: 0 };
    expansionResult = { data: [], error: null };
    catalogRows = [
        { id: "principal-1", ean: "111", stock: stockRow },
        { id: "solo-1", ean: "222", stock: stockRow },
        { id: "other-1", ean: "333", stock: stockRow },
    ];
});

describe("pushInventoryToGoogle — push ciblé (A1)", () => {
    it("variante touchée → cible son PRINCIPAL, et LUI SEUL part vers Google", async () => {
        expansionResult = { data: [{ id: "var-1", variant_of: "principal-1" }], error: null };
        await pushInventoryToGoogle("m-1", ["var-1"]);

        expect(recorded.expansionInIds).toEqual(["var-1"]);
        expect(recorded.mainInIds).toEqual([["principal-1"]]);
        expect(pushedProductIds()).toEqual(["principal-1"]); // pas other-1/solo-1 = pas de push global
    });

    it("produit solo touché → cible le produit lui-même", async () => {
        expansionResult = { data: [{ id: "solo-1", variant_of: null }], error: null };
        await pushInventoryToGoogle("m-1", ["solo-1"]);

        expect(recorded.mainInIds).toEqual([["solo-1"]]);
        expect(pushedProductIds()).toEqual(["solo-1"]);
    });

    it("deux variantes du même groupe → UN id principal dédupliqué", async () => {
        expansionResult = {
            data: [
                { id: "var-1", variant_of: "principal-1" },
                { id: "var-2", variant_of: "principal-1" },
            ],
            error: null,
        };
        await pushInventoryToGoogle("m-1", ["var-1", "var-2"]);

        expect(recorded.mainInIds).toEqual([["principal-1"]]);
        expect(pushedProductIds()).toEqual(["principal-1"]);
    });

    it("échec de la lecture d'expansion → repli sur le push COMPLET + captureError (jamais Google périmé en silence)", async () => {
        expansionResult = { data: null, error: { message: "db blip" } };
        await pushInventoryToGoogle("m-1", ["var-1"]);

        expect(captureMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ context: "google-inventory-expand-touched" }),
        );
        // Pas de filtre .in → catalogue complet poussé (comportement pré-A1, conservateur).
        expect(recorded.mainInIds).toEqual([null]);
        expect(pushedProductIds()).toEqual(["principal-1", "solo-1", "other-1"]);
    });

    it("data=null SANS error (anomalie SDK) → même repli conservateur + captureError", async () => {
        expansionResult = { data: null, error: null };
        await pushInventoryToGoogle("m-1", ["var-1"]);

        expect(captureMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ context: "google-inventory-expand-touched" }),
        );
        expect(recorded.mainInIds).toEqual([null]);
    });

    it("produits touchés introuvables (supprimés) → AUCUN push, et surtout PAS un push complet", async () => {
        expansionResult = { data: [], error: null };
        await pushInventoryToGoogle("m-1", ["deleted-1"]);

        expect(recorded.mainQueries).toBe(0); // la requête catalogue n'est même pas lancée
        expect(googleFetch).not.toHaveBeenCalled();
    });

    it("sans productIds (chemin syncMerchantPOS) → pas d'expansion, push complet INCHANGÉ", async () => {
        await pushInventoryToGoogle("m-1");

        expect(recorded.expansionInIds).toBeNull(); // aucune requête d'expansion
        expect(recorded.mainInIds).toEqual([null]); // aucun filtre .in
        expect(pushedProductIds()).toEqual(["principal-1", "solo-1", "other-1"]);
    });
});

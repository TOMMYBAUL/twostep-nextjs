import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * HOT PATH identité/concordance — `PATCH /api/products/[id]` : correction MANUELLE d'EAN.
 *
 * North-star §1 (« ne rien oublier », pilier 1) + §2 (stock honnête) : un marchand qui
 * corrige l'EAN d'un produit depuis /dashboard/products/[id]/edit change son IDENTITÉ.
 * Le regroupement variantes (`groupVariantsByEAN`) ne relit QUE les produits
 * `variant_of IS NULL` — il ne DÉ-groupe jamais. Sans réamorçage après une correction :
 *  - un produit devenu variante reste `visible=false, variant_of=Q` À JAMAIS = produit
 *    silencieusement PERDU (jamais dans le feed, jamais découvrable) ;
 *  - un PRINCIPAL dont on change l'EAN laisse ses enfants orphelins + garde un stock
 *    cumulé faux = faux « en stock » (faux positif n°1).
 *
 * Le fix : sur un CHANGEMENT RÉEL d'EAN, relâcher le produit édité ET ses variantes-enfants
 * (`variant_of` → null) puis re-dériver `groupVariantsByEAN`. Post-pass dérivé, non fatal
 * (l'édition est déjà committée) → capture-and-continue. Ce test drive le VRAI handler PATCH
 * et verrouille : (a) regroup déclenché SSI l'EAN change vraiment ; (b) relâche self+enfants ;
 * (c) un échec de regroup n'annule PAS l'édition mais est VISIBLE (captureError).
 */

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

const groupMock = vi.fn(async () => 0);
vi.mock("@/lib/pos/sync-engine", () => ({
    groupVariantsByEAN: (...a: unknown[]) => groupMock(...a),
}));

const USER_ID = "user-1";
const PRODUCT_ID = "prod-1";
const MERCHANT_ID = "merch-1";
const OLD_EAN = "1234567890123";

// ─── Faux client user (RLS) : ownership select + main update ────────────────
let ownershipResponse: { data: unknown; error: unknown };
let updateResponse: { data: unknown; error: unknown };
const mainUpdatePayloads: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) },
        from: (table: string) => {
            if (table !== "products") throw new Error(`unexpected user table ${table}`);
            let isUpdate = false;
            const b: Record<string, unknown> = {
                select: () => b,
                eq: () => b,
                update: (p: Record<string, unknown>) => {
                    isUpdate = true;
                    mainUpdatePayloads.push(p);
                    return b;
                },
                single: async () => (isUpdate ? updateResponse : ownershipResponse),
            };
            return b;
        },
    }),
}));

// ─── Faux admin : feed_events insert + les 2 relâches variant_of=null ────────
let releaseSelfResult: { error: unknown };
let releaseChildResult: { error: unknown };
const releaseCalls: Array<{ payload: Record<string, unknown>; eqs: Array<[string, unknown]> }> = [];
const feedInserts: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            if (table === "feed_events") {
                return { insert: async (row: Record<string, unknown>) => { feedInserts.push(row); return { error: null }; } };
            }
            if (table === "products") {
                let payload: Record<string, unknown> = {};
                const eqs: Array<[string, unknown]> = [];
                const builder: Record<string, unknown> = {
                    update: (p: Record<string, unknown>) => { payload = p; return builder; },
                    eq: (col: string, val: unknown) => { eqs.push([col, val]); return builder; },
                    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
                        releaseCalls.push({ payload, eqs });
                        const isChild = eqs.some(([c]) => c === "variant_of");
                        return Promise.resolve(isChild ? releaseChildResult : releaseSelfResult).then(resolve, reject);
                    },
                };
                return builder;
            }
            throw new Error(`unexpected admin table ${table}`);
        },
    }),
}));

import { PATCH } from "@/app/api/products/[id]/route";

function patch(body: Record<string, unknown>) {
    const req = new Request(`http://localhost/api/products/${PRODUCT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    return PATCH(req, { params: Promise.resolve({ id: PRODUCT_ID }) });
}

beforeEach(() => {
    captureMock.mockClear();
    groupMock.mockClear();
    groupMock.mockImplementation(async () => 0);
    mainUpdatePayloads.length = 0;
    releaseCalls.length = 0;
    feedInserts.length = 0;
    ownershipResponse = {
        data: { merchant_id: MERCHANT_ID, price: 10, ean: OLD_EAN, variant_of: null, merchants: { user_id: USER_ID } },
        error: null,
    };
    updateResponse = { data: { id: PRODUCT_ID, ean: OLD_EAN }, error: null };
    releaseSelfResult = { error: null };
    releaseChildResult = { error: null };
});

describe("PATCH /api/products/[id] — re-groupage après correction manuelle d'EAN", () => {
    it("déclenche le regroupage quand l'EAN change vraiment + relâche self ET enfants", async () => {
        const res = await patch({ ean: "3610000000009" });
        expect(res.status).toBe(200);

        // north-star : le regroupage EST re-dérivé (sinon variante orpheline / stock faux)
        expect(groupMock).toHaveBeenCalledTimes(1);
        expect(groupMock.mock.calls[0][1]).toBe(MERCHANT_ID);

        // relâche self (eq id) ET enfants (eq variant_of), toutes scopées au marchand
        expect(releaseCalls).toHaveLength(2);
        const self = releaseCalls.find((c) => c.eqs.some(([col, v]) => col === "id" && v === PRODUCT_ID));
        const child = releaseCalls.find((c) => c.eqs.some(([col, v]) => col === "variant_of" && v === PRODUCT_ID));
        expect(self).toBeTruthy();
        expect(child).toBeTruthy();
        expect(self!.payload).toEqual({ variant_of: null });
        expect(child!.payload).toEqual({ variant_of: null });
        expect(self!.eqs).toContainEqual(["merchant_id", MERCHANT_ID]);
        expect(child!.eqs).toContainEqual(["merchant_id", MERCHANT_ID]);

        // le main update ne porte PAS variant_of (relâche faite via admin, pas via RLS user)
        expect(mainUpdatePayloads[0]).toHaveProperty("ean", "3610000000009");
        expect(mainUpdatePayloads[0]).not.toHaveProperty("variant_of");
    });

    it("ne regroupe PAS quand l'EAN n'est pas dans le body (édition d'un autre champ)", async () => {
        const res = await patch({ name: "Nouveau nom" });
        expect(res.status).toBe(200);
        expect(groupMock).not.toHaveBeenCalled();
        expect(releaseCalls).toHaveLength(0);
    });

    it("ne regroupe PAS quand l'EAN envoyé est identique à l'existant", async () => {
        const res = await patch({ ean: OLD_EAN });
        expect(res.status).toBe(200);
        expect(groupMock).not.toHaveBeenCalled();
        expect(releaseCalls).toHaveLength(0);
    });

    it("regroupe quand l'EAN passe de null → valeur (produit sans EAN corrigé)", async () => {
        ownershipResponse = {
            data: { merchant_id: MERCHANT_ID, price: 10, ean: null, variant_of: null, merchants: { user_id: USER_ID } },
            error: null,
        };
        const res = await patch({ ean: "3610000000009" });
        expect(res.status).toBe(200);
        expect(groupMock).toHaveBeenCalledTimes(1);
    });

    it("regroupe quand l'EAN passe de valeur → null (correction effacée)", async () => {
        const res = await patch({ ean: null });
        expect(res.status).toBe(200);
        expect(groupMock).toHaveBeenCalledTimes(1);
    });

    it("un échec de regroup n'annule PAS l'édition (200) mais est VISIBLE (captureError)", async () => {
        groupMock.mockImplementation(async () => { throw new Error("regroup boom"); });
        const res = await patch({ ean: "3610000000009" });
        expect(res.status).toBe(200); // l'édition est committée : ne pas la perdre
        expect(captureMock).toHaveBeenCalledTimes(1);
        expect(captureMock.mock.calls[0][1]).toMatchObject({ phase: "regroup-after-ean-change", productId: PRODUCT_ID });
    });

    it("un échec de relâche (self) est non fatal + visible, sans appeler le regroup", async () => {
        releaseSelfResult = { error: { message: "release denied" } };
        const res = await patch({ ean: "3610000000009" });
        expect(res.status).toBe(200);
        expect(groupMock).not.toHaveBeenCalled(); // throw avant le regroup
        expect(captureMock).toHaveBeenCalledTimes(1);
        expect(captureMock.mock.calls[0][1]).toMatchObject({ phase: "regroup-after-ean-change" });
    });

    it("rejette un EAN mal formé sans toucher au regroupage (validation amont)", async () => {
        const res = await patch({ ean: "abc" });
        expect(res.status).toBe(400);
        expect(groupMock).not.toHaveBeenCalled();
        expect(releaseCalls).toHaveLength(0);
    });
});

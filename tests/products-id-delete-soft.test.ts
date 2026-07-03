import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * HOT PATH masquage marchand — `DELETE /api/products/[id]` (soft-delete POS).
 *
 * INVARIANT (north-star « zéro faux positif ») : tout masquage DÉLIBÉRÉ d'un produit doit poser
 * `review_status='rejected'` en plus de `visible=false`. Sinon le produit reste
 * `variant_of=null, visible=false, review_status='validated', nom, stock>0` = signature EXACTE du
 * watchdog de complétude `isInvisibleOrphan` → l'alarme crierait au loup CHAQUE JOUR sur une action
 * voulue par le marchand (finding HIGH silent-failure-hunter). La route `reject` posait déjà ce
 * marqueur ; le soft-delete POS ne le posait PAS. Ce test drive le VRAI handler DELETE.
 */

const USER_ID = "user-1";
const PRODUCT_ID = "prod-1";

let ownershipData: unknown;
const updatePayloads: Array<Record<string, unknown>> = [];
let hardDeleted = false;

vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) },
        from: (table: string) => {
            if (table !== "products") throw new Error(`unexpected table ${table}`);
            let mode: "select" | "update" | "delete" = "select";
            const b: Record<string, unknown> = {
                select: () => {
                    mode = "select";
                    return b;
                },
                update: (p: Record<string, unknown>) => {
                    mode = "update";
                    updatePayloads.push(p);
                    return b;
                },
                delete: () => {
                    mode = "delete";
                    return b;
                },
                eq: () => {
                    if (mode === "update") return Promise.resolve({ error: null });
                    if (mode === "delete") {
                        hardDeleted = true;
                        return Promise.resolve({ error: null });
                    }
                    return b; // select → chaîne vers .single()
                },
                single: async () => ({ data: ownershipData, error: null }),
            };
            return b;
        },
    }),
}));

import { DELETE } from "@/app/api/products/[id]/route";

function del() {
    return DELETE(new Request(`http://localhost/api/products/${PRODUCT_ID}`, { method: "DELETE" }), {
        params: Promise.resolve({ id: PRODUCT_ID }),
    });
}

beforeEach(() => {
    updatePayloads.length = 0;
    hardDeleted = false;
});

describe("DELETE /api/products/[id] — soft-delete POS pose le marqueur de masquage délibéré", () => {
    it("produit POS : visible=false ET review_status='rejected' (pas un visible=false nu → anti faux positif HIGH)", async () => {
        ownershipData = { id: PRODUCT_ID, pos_item_id: "sq-42", merchants: { user_id: USER_ID } };
        const res = await del();
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(200);
        expect(body.soft_deleted).toBe(true);
        expect(updatePayloads).toHaveLength(1);
        expect(updatePayloads[0]).toEqual({ visible: false, review_status: "rejected" });
        expect(hardDeleted).toBe(false);
    });

    it("produit manuel (sans pos_item_id) : hard delete, aucun update de masquage", async () => {
        ownershipData = { id: PRODUCT_ID, pos_item_id: null, merchants: { user_id: USER_ID } };
        const res = await del();
        expect(res.status).toBe(200);
        expect(updatePayloads).toHaveLength(0);
        expect(hardDeleted).toBe(true);
    });
});

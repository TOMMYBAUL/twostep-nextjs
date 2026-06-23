import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * HOT PATH annulation de facture → RÉVERSION du stock (`POST /api/invoices/[id]/cancel`).
 *
 * North-star §1 : « afficher honnêtement, zéro faux positif ». Annuler une facture validée
 * doit RETIRER du stock la marchandise qui avait été reçue. Deux modes :
 *  - hard-undo (<10 min) : on décrémente le stock et on remet la facture en `parsed` ;
 *  - correctif (>10 min)  : on crée une facture de correction négative + on décrémente.
 *
 * Chemin d'écriture LIVE sans aucun test, portant des pertes silencieuses RÉELLES
 * (vérifiées dans le code) — même classe que `resync-stock`/invoice-validate :
 *
 *  #1 (CORRUPTION) — le read-modify-write de réversion lisait `stock.quantity` SANS
 *     destructurer `error` ; sur un blip DB → `current=null` → `next = max(0, (null ?? 0) -
 *     delta) = 0` → le stock du produit est FORCÉ À 0 (au lieu d'être décrémenté). Une vraie
 *     quantité est écrasée = faux « rupture » silencieux. (Aggravé par le fait que la RPC
 *     `increment_stock_quantity` N'EXISTE dans AUCUNE migration → le fallback buggé tourne à
 *     CHAQUE annulation.)
 *  #2 (north-star) — l'`update` de réversion avalait son `error` → un échec d'écriture laissait
 *     le stock NON décrémenté mais la facture quand même remise en `parsed` → stock fantôme
 *     gonflé derrière un voyant vert.
 *  #3 — la remise à jour du statut facture avalait son `error`.
 *
 * Méthode qualité (priorities §1bis) : on drive la VRAIE route avec un faux client Supabase
 * qui ENREGISTRE les écritures de stock et permet d'INJECTER des erreurs ciblées par produit.
 * On prouve qu'un échec n'écrase JAMAIS le stock à 0 et est rendu VISIBLE (captureError) +
 * réponse honnête (500), jamais un faux « annulée ».
 */

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => null) }));

// ─── Faux client serveur (auth + lookup marchand + lookup facture) ──────────
const mockGetUser = vi.fn();
let merchantRow: { id: string } | null = { id: "merch-1" };
let invoiceRow: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({
        auth: { getUser: mockGetUser },
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () =>
                        table === "merchants"
                            ? { data: merchantRow, error: null }
                            : { data: invoiceRow, error: null },
                }),
            }),
        }),
    })),
}));

// ─── Faux client admin (invoice_items + stock + invoices) ───────────────────
interface AdminState {
    invoiceItems: Array<Record<string, unknown>> | null;
    invoiceItemsErr: unknown;
    stockByProduct: Record<string, number>;
    stockReadErrByProduct: Record<string, unknown>;
    stockUpdateErrByProduct: Record<string, unknown>;
    invoiceUpdateErr: unknown;
    correctiveInsert: { data: { id: string } | null; error: unknown };
    correctiveItemInsertErr: unknown;
    // enregistrements
    stockUpdates: Array<{ productId: string; quantity: number }>;
    correctiveItems: Array<Record<string, unknown>>;
    invoiceStatusUpdates: Array<Record<string, unknown>>;
}

let admin: AdminState;

function makeAdminState(over: Partial<AdminState> = {}): AdminState {
    return {
        invoiceItems: [
            { id: "it-1", product_id: "prod-1", quantity: 5, received_qty: null, status: "validated" },
            { id: "it-2", product_id: "prod-2", quantity: 3, received_qty: null, status: "validated" },
        ],
        invoiceItemsErr: null,
        stockByProduct: { "prod-1": 20, "prod-2": 10 },
        stockReadErrByProduct: {},
        stockUpdateErrByProduct: {},
        invoiceUpdateErr: null,
        correctiveInsert: { data: { id: "corr-1" }, error: null },
        correctiveItemInsertErr: null,
        stockUpdates: [],
        correctiveItems: [],
        invoiceStatusUpdates: [],
        ...over,
    };
}

// builder chaînable minimal qui résout select/insert/update + eq + maybeSingle/single/then
function adminFrom(table: string) {
    const ctx: { table: string; op: string; payload: Record<string, unknown> | null; filters: Record<string, unknown> } = {
        table,
        op: "select",
        payload: null,
        filters: {},
    };
    const builder = {
        select() {
            return builder;
        },
        insert(payload: Record<string, unknown>) {
            ctx.op = "insert";
            ctx.payload = payload;
            return builder;
        },
        update(payload: Record<string, unknown>) {
            ctx.op = "update";
            ctx.payload = payload;
            return builder;
        },
        eq(col: string, val: unknown) {
            ctx.filters[col] = val;
            return builder;
        },
        maybeSingle() {
            return Promise.resolve(resolveSingle(ctx));
        },
        single() {
            return Promise.resolve(resolveSingle(ctx));
        },
        then(resolve: (v: { data: unknown; error: unknown }) => void, reject?: (e: unknown) => void) {
            return Promise.resolve(resolveList(ctx)).then(resolve, reject);
        },
    };
    return builder;
}

type Ctx = { table: string; op: string; payload: Record<string, unknown> | null; filters: Record<string, unknown> };

function resolveSingle(ctx: Ctx): { data: unknown; error: unknown } {
    if (ctx.table === "stock" && ctx.op === "select") {
        const pid = ctx.filters.product_id as string;
        if (admin.stockReadErrByProduct[pid]) return { data: null, error: admin.stockReadErrByProduct[pid] };
        const q = admin.stockByProduct[pid];
        return { data: q == null ? null : { quantity: q }, error: null };
    }
    if (ctx.table === "invoices" && ctx.op === "insert") {
        return admin.correctiveInsert;
    }
    return { data: null, error: null };
}

function resolveList(ctx: Ctx): { data: unknown; error: unknown } {
    if (ctx.table === "invoice_items" && ctx.op === "select") {
        return { data: admin.invoiceItems, error: admin.invoiceItemsErr };
    }
    if (ctx.table === "invoice_items" && ctx.op === "insert") {
        if (admin.correctiveItemInsertErr) return { data: null, error: admin.correctiveItemInsertErr };
        admin.correctiveItems.push(ctx.payload!);
        return { data: null, error: null };
    }
    if (ctx.table === "stock" && ctx.op === "update") {
        const pid = ctx.filters.product_id as string;
        if (admin.stockUpdateErrByProduct[pid]) return { data: null, error: admin.stockUpdateErrByProduct[pid] };
        const quantity = ctx.payload!.quantity as number;
        admin.stockByProduct[pid] = quantity;
        admin.stockUpdates.push({ productId: pid, quantity });
        return { data: null, error: null };
    }
    if (ctx.table === "invoices" && ctx.op === "update") {
        if (admin.invoiceUpdateErr) return { data: null, error: admin.invoiceUpdateErr };
        admin.invoiceStatusUpdates.push(ctx.payload!);
        return { data: null, error: null };
    }
    return { data: null, error: null };
}

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (table: string) => adminFrom(table),
        // RPC inexistante en prod (aucune migration ne la définit) → toujours en erreur.
        rpc: () => Promise.resolve({ data: null, error: { message: "function increment_stock_quantity does not exist" } }),
    }),
}));

async function callCancel(id = "inv-1") {
    const { POST } = await import("@/app/api/invoices/[id]/cancel/route");
    const req = new NextRequest(`http://localhost/api/invoices/${id}/cancel`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id }) });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}

function nowIso() {
    return new Date().toISOString();
}
function oldIso() {
    return new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 h ago → hors fenêtre
}

describe("POST /api/invoices/[id]/cancel — réversion de stock sans perte silencieuse", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        merchantRow = { id: "merch-1" };
        invoiceRow = { id: "inv-1", merchant_id: "merch-1", status: "validated", validated_at: nowIso(), kind: null };
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
        admin = makeAdminState();
    });

    it("401 si non authentifié", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const { status } = await callCancel();
        expect(status).toBe(401);
    });

    it("404 si la facture n'appartient pas au marchand", async () => {
        invoiceRow = { id: "inv-1", merchant_id: "autre", status: "validated", validated_at: nowIso(), kind: null };
        const { status } = await callCancel();
        expect(status).toBe(404);
    });

    it("lecture invoice_items en ERREUR (blip DB) → 500 + captureError, PAS un faux 'annulée' sans réversion", async () => {
        admin = makeAdminState({ invoiceItems: null, invoiceItemsErr: { code: "57014", message: "canceling" } });
        const { status, json } = await callCancel();
        expect(status).toBe(500);
        expect(json.mode).toBeUndefined();
        expect(captureMock).toHaveBeenCalled();
        // aucun stock touché si on n'a pas pu lire les lignes
        expect(admin.stockUpdates).toHaveLength(0);
    });

    it("hard-undo happy : stock décrémenté du delta exact, facture remise en parsed, 0 captureError", async () => {
        const { status, json } = await callCancel();
        expect(status).toBe(200);
        expect(json.mode).toBe("hard_undo");
        // prod-1: 20-5=15 ; prod-2: 10-3=7
        expect(admin.stockByProduct["prod-1"]).toBe(15);
        expect(admin.stockByProduct["prod-2"]).toBe(7);
        expect(admin.invoiceStatusUpdates).toHaveLength(1);
        expect(admin.invoiceStatusUpdates[0].status).toBe("parsed");
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("#1 CORRUPTION : un blip DB sur la lecture stock NE force PAS le stock à 0 + 500 + captureError", async () => {
        admin = makeAdminState({ stockReadErrByProduct: { "prod-1": { code: "57014", message: "canceling" } } });
        const { status } = await callCancel();
        expect(status).toBe(500);
        // prod-1 NON touché (pas d'écrasement à 0) — sa vraie quantité préservée
        expect(admin.stockByProduct["prod-1"]).toBe(20);
        expect(admin.stockUpdates.find((u) => u.productId === "prod-1")).toBeUndefined();
        expect(captureMock).toHaveBeenCalled();
        // facture NON remise en parsed (réversion partielle → reste annulable)
        expect(admin.invoiceStatusUpdates).toHaveLength(0);
    });

    it("#2 north-star : un échec d'update stock est VISIBLE (500 + captureError), pas un faux 'annulée'", async () => {
        admin = makeAdminState({ stockUpdateErrByProduct: { "prod-2": { code: "23514", message: "check" } } });
        const { status, json } = await callCancel();
        expect(status).toBe(500);
        expect(json.mode).toBeUndefined();
        expect(captureMock).toHaveBeenCalled();
        expect(admin.invoiceStatusUpdates).toHaveLength(0);
    });

    it("réversion partielle : l'item OK est bien décrémenté, l'échec compté + capturé", async () => {
        admin = makeAdminState({ stockReadErrByProduct: { "prod-2": { message: "boom" } } });
        const { json, status } = await callCancel();
        expect(status).toBe(500);
        // prod-1 réversé, prod-2 échoué
        expect(admin.stockByProduct["prod-1"]).toBe(15);
        expect(json.failed).toBe(1);
        expect(captureMock).toHaveBeenCalledTimes(1);
    });

    it("#3 : un échec de remise à jour du statut facture est VISIBLE (captureError + 500)", async () => {
        admin = makeAdminState({ invoiceUpdateErr: { message: "status write failed" } });
        const { status } = await callCancel();
        // le stock a bien été réversé mais la facture n'a pas pu être remise en parsed → signalé
        expect(admin.stockByProduct["prod-1"]).toBe(15);
        expect(captureMock).toHaveBeenCalled();
        expect(status).toBe(500);
    });

    it("correctif (hors fenêtre) : facture corrective créée + stock décrémenté + items correctifs", async () => {
        invoiceRow = { id: "inv-1", merchant_id: "merch-1", status: "validated", validated_at: oldIso(), kind: null };
        const { status, json } = await callCancel();
        expect(status).toBe(200);
        expect(json.mode).toBe("corrective");
        expect(json.corrective_invoice_id).toBe("corr-1");
        expect(admin.stockByProduct["prod-1"]).toBe(15);
        expect(admin.stockByProduct["prod-2"]).toBe(7);
        expect(admin.correctiveItems).toHaveLength(2);
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("correctif #1 CORRUPTION : blip lecture stock NE force PAS à 0 + 500 + captureError", async () => {
        invoiceRow = { id: "inv-1", merchant_id: "merch-1", status: "validated", validated_at: oldIso(), kind: null };
        admin = makeAdminState({ stockReadErrByProduct: { "prod-1": { message: "boom" } } });
        const { status } = await callCancel();
        expect(status).toBe(500);
        expect(admin.stockByProduct["prod-1"]).toBe(20);
        expect(captureMock).toHaveBeenCalled();
    });
});

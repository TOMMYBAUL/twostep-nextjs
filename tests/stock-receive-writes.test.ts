import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * HOT PATH livraison reçue → stock (`POST /api/stock/receive`).
 *
 * North-star §1 : « ne RIEN oublier silencieusement ». Le marchand confirme avoir reçu une
 * livraison ; la route déplace chaque ligne `stock_incoming` vers le stock réel via la RPC
 * atomique `receive_stock_incoming` (incrémente le stock + marque la ligne `received` +
 * feed_event `restock`, dans UNE transaction). C'était un chemin d'ÉCRITURE live SANS aucun
 * test, portant 2 pertes silencieuses réelles (vérifiées dans le code, même classe que
 * `resync-stock` `if(!error) updated++` / invoice-validate : « erreur ≠ succès ») :
 *
 *  #1 (north-star) — la boucle appelait `await admin.rpc("receive_stock_incoming", …)` SANS
 *     destructurer `error`, puis `received++` quoi qu'il arrive. Un échec RPC (blip DB,
 *     contrainte, RAISE) → le stock n'est PAS incrémenté, la ligne reste `incoming`, MAIS la
 *     réponse annonce « received: N » → le marchand croit son stock à jour = livraison perdue
 *     en silence, derrière un voyant vert. La RPC étant atomique par item, un échec ne
 *     demi-applique rien → l'item reste re-cliquable (`status='incoming'`) = idempotent.
 *  #2 — la lecture `stock_incoming` avalait son `error` → un blip DB devenait indistinct de
 *     « aucune livraison en attente » (`404 No incoming stock found`) = faux diagnostic.
 *
 * Méthode qualité (priorities §1bis) : on drive la VRAIE route avec un faux client Supabase
 * qui ENREGISTRE les appels RPC et permet d'INJECTER des erreurs ciblées par item. On prouve
 * que `received` ne compte QUE les succès réels et que chaque échec est rendu VISIBLE
 * (captureError) — jamais avalé.
 */

const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

// ─── Faux client serveur (auth + lookup marchand) ───────────────────────────
const mockGetUser = vi.fn();
let merchantRow: { id: string } | null = { id: "merch-1" };
let merchantErr: unknown = null; // blip DB sur le lookup marchand (≠ absence)

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({
        auth: { getUser: mockGetUser },
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: async () => ({ data: merchantErr ? null : merchantRow, error: merchantErr ?? (merchantRow ? null : { code: "PGRST116" }) }),
                    maybeSingle: async () => ({ data: merchantRow, error: null }),
                }),
            }),
        }),
    })),
}));

// ─── Faux client admin (query incoming + rpc) ───────────────────────────────
interface IncomingItem {
    id: string;
    product_id: string;
    quantity: number;
    products: { merchant_id: string };
}

interface AdminState {
    incoming: IncomingItem[] | null;
    incomingErr: unknown;
    // erreur ciblée par incoming-id sur la RPC (sinon succès)
    rpcErrByIncomingId: Record<string, unknown>;
    rpcCalls: Array<{ incomingId: string; productId: string; delta: number }>;
}

let admin: AdminState;

function makeAdminState(over: Partial<AdminState> = {}): AdminState {
    return {
        incoming: [
            { id: "in-1", product_id: "prod-1", quantity: 5, products: { merchant_id: "merch-1" } },
            { id: "in-2", product_id: "prod-2", quantity: 3, products: { merchant_id: "merch-1" } },
        ],
        incomingErr: null,
        rpcErrByIncomingId: {},
        rpcCalls: [],
        ...over,
    };
}

class IncomingQuery {
    // thenable : await renvoie {data,error}
    eq() { return this; }
    in() { return this; }
    then(resolve: (v: { data: IncomingItem[] | null; error: unknown }) => void) {
        resolve({ data: admin.incoming, error: admin.incomingErr });
    }
}

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
        from: () => ({ select: () => new IncomingQuery() }),
        rpc: async (_name: string, params: { p_incoming_id: string; p_product_id: string; p_delta: number }) => {
            admin.rpcCalls.push({ incomingId: params.p_incoming_id, productId: params.p_product_id, delta: params.p_delta });
            const err = admin.rpcErrByIncomingId[params.p_incoming_id] ?? null;
            return { data: null, error: err };
        },
    }),
}));

async function callReceive(body: unknown) {
    const { POST } = await import("@/app/api/stock/receive/route");
    const req = new NextRequest("http://localhost/api/stock/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const res = await POST(req);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}

describe("POST /api/stock/receive — perte silencieuse livraison reçue", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        merchantRow = { id: "merch-1" };
        merchantErr = null;
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
        admin = makeAdminState();
    });

    it("401 si non authentifié", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const { status } = await callReceive({ invoice_id: "inv-1" });
        expect(status).toBe(401);
    });

    it("happy path : 2 lignes reçues → 2 RPC, received=2, 0 captureError", async () => {
        const { status, json } = await callReceive({ invoice_id: "inv-1" });
        expect(status).toBe(200);
        expect(json.received).toBe(2);
        expect(admin.rpcCalls).toHaveLength(2);
        expect(admin.rpcCalls[0]).toEqual({ incomingId: "in-1", productId: "prod-1", delta: 5 });
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("#2 lecture incoming en ERREUR (blip DB) → 500 + captureError, PAS un 404 'rien à recevoir'", async () => {
        admin = makeAdminState({ incoming: null, incomingErr: { code: "57014", message: "canceling statement" } });
        const { status, json } = await callReceive({ invoice_id: "inv-1" });
        expect(status).toBe(500);
        expect(json.received).toBeUndefined();
        expect(captureMock).toHaveBeenCalled();
        // aucune RPC tentée si on n'a pas pu lire la liste
        expect(admin.rpcCalls).toHaveLength(0);
    });

    it("lookup marchand en ERREUR (blip DB) → 500 + captureError, PAS un 404 'No merchant'", async () => {
        merchantErr = { code: "57014", message: "canceling statement" };
        const { status } = await callReceive({ invoice_id: "inv-1" });
        expect(status).toBe(500);
        expect(captureMock).toHaveBeenCalled();
        expect(admin.rpcCalls).toHaveLength(0);
    });

    it("absence VRAIE de marchand (PGRST116) → 404 'No merchant', 0 captureError", async () => {
        merchantRow = null;
        const { status } = await callReceive({ invoice_id: "inv-1" });
        expect(status).toBe(404);
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("vide RÉEL (sans erreur) → 404 'No incoming stock found', 0 captureError", async () => {
        admin = makeAdminState({ incoming: [], incomingErr: null });
        const { status } = await callReceive({ invoice_id: "inv-1" });
        expect(status).toBe(404);
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("#1 (north-star) RPC échoue sur 1 item → received ne compte QUE le succès, échec rendu VISIBLE", async () => {
        admin = makeAdminState({ rpcErrByIncomingId: { "in-2": { code: "23505", message: "constraint" } } });
        const { status, json } = await callReceive({ invoice_id: "inv-1" });
        // partiel : in-1 reçu, in-2 échoué → received=1 (honnête), échec capturé
        expect(json.received).toBe(1);
        expect(json.failed).toBe(1);
        expect(status).toBe(200);
        expect(captureMock).toHaveBeenCalledTimes(1);
        // in-2 reste re-cliquable (la RPC ne l'a pas marqué received en cas d'échec)
    });

    it("#1 TOUTES les RPC échouent → 500 (rien reçu), received n'est PAS annoncé en succès", async () => {
        admin = makeAdminState({
            rpcErrByIncomingId: { "in-1": { message: "boom" }, "in-2": { message: "boom" } },
        });
        const { status, json } = await callReceive({ invoice_id: "inv-1" });
        expect(status).toBe(500);
        expect(json.received).toBeUndefined();
        expect(captureMock).toHaveBeenCalledTimes(2);
    });
});

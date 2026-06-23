import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * HOT PATH facture → catalogue POS (`activateInvoice`, via `POST /api/invoices/[id]/activate`).
 *
 * North-star §1 : « ne RIEN oublier silencieusement ». `activateInvoice` POUSSE le catalogue
 * groupé (créé par validate) vers la caisse du marchand (`pushCatalog`) puis STOCKE le mapping
 * `pos_item_id` (clé de jointure Two-Step ↔ POS — sans elle, aucun webhook temps réel ne
 * résout le produit). C'était un chemin d'ÉCRITURE live (route `activate`) SANS aucun test,
 * portant plusieurs PERTES SILENCIEUSES réelles (vérifiées dans le code, même classe que
 * maillon 8 / `resolveWebhookProduct` : « erreur DB ≠ rien à faire ») :
 *
 *  #1 (north-star) — la lecture de `pos_connections` avalait son `error` (`maybeSingle()` sans
 *     destructurer). Un blip DB → `conn=null` → le marchand POS était traité comme NON-POS →
 *     facture marquée « imported » MAIS catalogue JAMAIS poussé → produits sans `pos_item_id` →
 *     plus jamais de stock temps réel = perte silencieuse de la propagation POS.
 *  #2 — la lecture `invoice_items` avalait son `error` → un blip DB se présentait comme
 *     « No validated products — run validate first » (faux diagnostic, validate POURTANT lancé).
 *  #3 — l'écriture du mapping `pos_item_id` (après un push RÉUSSI) avalait son `error` →
 *     produit présent dans la caisse mais mapping perdu = webhooks futurs non résolus, en silence.
 *  #4 — les MAJ de statut facture avalaient leur `error` → facture « bloquée » sans signal.
 *
 * Méthode qualité (priorities §1bis) : on drive la VRAIE fonction `activateInvoice` avec un faux
 * client Supabase stateful qui ENREGISTRE les écritures et permet d'INJECTER des erreurs ciblées.
 * On inspecte la table résultante ET on prouve que chaque échec est rendu VISIBLE (captureError /
 * throw), jamais avalé.
 */

// ─── Mocks de modules (deps de activateInvoice) ─────────────────────────────
const captureMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureMock(...a) }));

vi.mock("@/lib/email/encryption", () => ({ decrypt: (s: string) => s }));

const pushCatalogMock = vi.fn();
vi.mock("@/lib/pos", () => ({
    getAdapter: () => ({ pushCatalog: (...a: unknown[]) => pushCatalogMock(...a) }),
}));

// ─── Faux client Supabase : query-builder thenable + état partagé ───────────
type WriteRec = { table: string; op: string; payload: unknown };

interface State {
    invoice: Record<string, unknown> | null;
    invoiceErr: unknown;
    invoiceItems: Array<{ product_id: string }> | null;
    itemsErr: unknown;
    products: Array<Record<string, unknown>> | null;
    productsErr: unknown;
    conn: Record<string, unknown> | null;
    connErr: unknown;
    writes: WriteRec[];
    posIdWriteErr: unknown; // erreur ciblée sur l'UPDATE products portant pos_item_id
    statusWriteErr: unknown; // erreur ciblée sur l'UPDATE invoices (statut)
}

function makeState(over: Partial<State> = {}): State {
    return {
        invoice: { id: "inv-1", merchant_id: "merch-1", supplier_name: "ACME", status: "parsed" },
        invoiceErr: null,
        invoiceItems: [{ product_id: "prod-1" }],
        itemsErr: null,
        products: [{ id: "prod-1", name: "Nike Dunk", canonical_name: "Nike Dunk Low", ean: "0123456789012", price: 90, category: "shoes", photo_url: null, pos_item_id: null }],
        productsErr: null,
        conn: { provider: "shopify", access_token: "tok", shop_domain: "x.myshopify.com" },
        connErr: null,
        writes: [],
        posIdWriteErr: null,
        statusWriteErr: null,
        ...over,
    };
}

class FakeQuery {
    op = "select";
    payload: unknown = null;
    constructor(private table: string, private state: State) {}
    select() { return this; }
    insert(p: unknown) { this.op = "insert"; this.payload = p; return this; }
    update(p: unknown) { this.op = "update"; this.payload = p; return this; }
    upsert(p: unknown) { this.op = "upsert"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    eq() { return this; }
    neq() { return this; }
    not() { return this; }
    in() { return this; }
    is() { return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { return this._resolve(); }
    single() { return this._resolve(); }
    then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return this._resolve().then(onF, onR);
    }
    private writeError(): unknown {
        const s = this.state;
        const p = this.payload as Record<string, unknown> | null;
        if (this.table === "products" && this.op === "update" && p && "pos_item_id" in p) return s.posIdWriteErr;
        if (this.table === "invoices" && this.op === "update") return s.statusWriteErr;
        return null;
    }
    private _resolve(): Promise<{ data: unknown; error: unknown }> {
        const { table, op, state } = this;
        if (op === "insert" || op === "update" || op === "upsert" || op === "delete") {
            state.writes.push({ table, op, payload: this.payload });
            return Promise.resolve({ data: null, error: this.writeError() });
        }
        // reads
        if (table === "invoices") return Promise.resolve({ data: state.invoice, error: state.invoiceErr });
        if (table === "invoice_items") return Promise.resolve({ data: state.invoiceItems, error: state.itemsErr });
        if (table === "products") return Promise.resolve({ data: state.products, error: state.productsErr });
        if (table === "pos_connections") return Promise.resolve({ data: state.conn, error: state.connErr });
        return Promise.resolve({ data: null, error: null });
    }
}

let currentState: State;
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({ from: (table: string) => new FakeQuery(table, currentState) }),
}));

// Import APRÈS les mocks.
import { activateInvoice } from "@/lib/invoice/activate";

function findWrite(table: string, op: string, predicate?: (p: any) => boolean) {
    return currentState.writes.find((w) => w.table === table && w.op === op && (!predicate || predicate(w.payload)));
}
function captureContexts() {
    return captureMock.mock.calls.map((c) => (c[1] as any)?.context);
}

beforeEach(() => {
    vi.clearAllMocks();
    pushCatalogMock.mockResolvedValue({ "ts-prod-1": "pos-999" });
});

describe("activateInvoice — push catalogue POS SANS perte silencieuse", () => {
    it("happy path POS : pushCatalog appelé, mapping pos_item_id écrit, statut imported", async () => {
        currentState = makeState();

        const result = await activateInvoice("inv-1");

        expect(pushCatalogMock).toHaveBeenCalledTimes(1);
        expect(result.pushed).toBe(1);
        // mapping pos_item_id écrit sur le produit
        const mapWrite = findWrite("products", "update", (p) => "pos_item_id" in p);
        expect(mapWrite).toBeTruthy();
        expect((mapWrite!.payload as any).pos_item_id).toBe("pos-999");
        // facture marquée imported
        const statusWrite = findWrite("invoices", "update", (p) => p.status === "imported");
        expect(statusWrite).toBeTruthy();
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("marchand NON-POS (aucune connexion, sans erreur) : pas de push, imported, 0 captureError", async () => {
        currentState = makeState({ conn: null });

        const result = await activateInvoice("inv-1");

        expect(pushCatalogMock).not.toHaveBeenCalled();
        expect(result).toEqual({ pushed: 0, synced: false });
        expect(findWrite("invoices", "update", (p) => p.status === "imported")).toBeTruthy();
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("#1 — lecture pos_connections en ERREUR ≠ non-POS : LÈVE + captureError, catalogue PAS poussé, facture PAS imported", async () => {
        currentState = makeState({ conn: null, connErr: { message: "db timeout" } });

        await expect(activateInvoice("inv-1")).rejects.toThrow();
        // North-star : on ne pousse PAS dans le vide ET on ne marque PAS imported en silence.
        expect(pushCatalogMock).not.toHaveBeenCalled();
        expect(findWrite("invoices", "update", (p) => p.status === "imported")).toBeUndefined();
        expect(captureContexts()).toContain("invoice-activate-conn-read");
    });

    it("#2 — lecture invoice_items en ERREUR ≠ 'run validate first' : LÈVE + captureError diagnostic juste", async () => {
        currentState = makeState({ invoiceItems: null, itemsErr: { message: "db blip" } });

        await expect(activateInvoice("inv-1")).rejects.toThrow();
        expect(captureContexts()).toContain("invoice-activate-items-read");
    });

    it("#2b — invoice_items VRAIMENT vide (sans erreur) : message 'run validate first', PAS de captureError", async () => {
        currentState = makeState({ invoiceItems: [] });

        await expect(activateInvoice("inv-1")).rejects.toThrow(/run validate first/i);
        expect(captureMock).not.toHaveBeenCalled();
    });

    it("#3 — écriture du mapping pos_item_id en ERREUR : captureError (visible) SANS throw (push déjà fait → pas de re-push)", async () => {
        currentState = makeState({ posIdWriteErr: { message: "update failed" } });

        const result = await activateInvoice("inv-1"); // ne doit PAS throw
        expect(result.pushed).toBe(1);
        expect(captureContexts()).toContain("invoice-activate-posid-write");
        // facture quand même marquée imported (le catalogue EST poussé)
        expect(findWrite("invoices", "update", (p) => p.status === "imported")).toBeTruthy();
    });

    it("#4 — MAJ statut facture en ERREUR : rendue VISIBLE (captureError), pas avalée", async () => {
        currentState = makeState({ statusWriteErr: { message: "status write failed" } });

        await activateInvoice("inv-1");
        expect(captureContexts()).toContain("invoice-activate-status");
    });

    it("pushCatalog qui throw : remonté en erreur (captureError + throw), facture PAS imported", async () => {
        currentState = makeState();
        pushCatalogMock.mockRejectedValue(new Error("POS 500"));

        await expect(activateInvoice("inv-1")).rejects.toThrow(/Failed to push/i);
        expect(findWrite("invoices", "update", (p) => p.status === "imported")).toBeUndefined();
    });

    it("#3a — lecture products en ERREUR ≠ '0 produit' : LÈVE + captureError (contexte d'origine préservé)", async () => {
        currentState = makeState({ products: null, productsErr: { message: "db down" } });

        await expect(activateInvoice("inv-1")).rejects.toThrow();
        expect(captureContexts()).toContain("invoice-activate-products-read");
    });

    it("#3b — lecture invoice en ERREUR ≠ 'introuvable' : LÈVE + captureError", async () => {
        currentState = makeState({ invoice: null, invoiceErr: { message: "rls/timeout" } });

        await expect(activateInvoice("inv-1")).rejects.toThrow();
        expect(captureContexts()).toContain("invoice-activate-invoice-read");
    });

    it("produits déjà dans le POS (pos_item_id présent) : pas de push, imported", async () => {
        currentState = makeState({
            products: [{ id: "prod-1", name: "X", canonical_name: "X", ean: "0123456789012", price: 90, category: null, photo_url: null, pos_item_id: "existing-1" }],
        });

        const result = await activateInvoice("inv-1");
        expect(pushCatalogMock).not.toHaveBeenCalled();
        expect(result).toEqual({ pushed: 0, synced: false });
    });
});

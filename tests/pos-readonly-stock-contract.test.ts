import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { squareAdapter } from "@/lib/pos/square";
import { shopifyAdapter } from "@/lib/pos/shopify";
import { lightspeedAdapter } from "@/lib/pos/lightspeed";
import { zettleAdapter } from "@/lib/pos/zettle";
import { clictillAdapter } from "@/lib/pos/clictill";
import { fastmagAdapter } from "@/lib/pos/fastmag";
import { captureError } from "@/lib/error";
import type { IPOSAdapter, POSProduct } from "@/lib/pos/types";

vi.mock("@/lib/error", () => ({ captureError: vi.fn() }));

// ─────────────────────────────────────────────────────────────────────────────
// D6 — CONTRAT « read-only STOCK » (north-star : « ne pas casser sa gestion de stock »)
//
// Invariant verrouillé : AUCUN adaptateur POS n'écrit de QUANTITÉ DE STOCK vers la
// caisse marchand. On LIT le stock (getStock) ; on ne le RÉÉCRIT jamais. Les seules
// écritures autorisées vers le POS sont du CATALOGUE :
//   - pushCatalog       : crée des produits (validation de facture) — name/price/EAN,
//                         JAMAIS de quantité d'inventaire ;
//   - updatePosProduct  : pousse l'EAN d'un produit (flag POS_WRITEBACK_ENABLED),
//                         JAMAIS de quantité d'inventaire.
//
// Trois gardes, du plus durable au plus précis :
//   A. OAuth consent  — aucun getAuthUrl ne demande un scope d'ÉCRITURE d'inventaire ;
//   B. Surface d'API  — aucun adaptateur n'expose une méthode d'écriture de stock ;
//   C. Comportement   — pushCatalog / updatePosProduct n'émettent aucune mutation de stock.
//
// Une régression future (ex. « renvoyons notre stock réconcilié vers Square ») fait
// échouer ce test AVANT de pouvoir corrompre la caisse d'un marchand.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_ADAPTERS: Array<[string, IPOSAdapter]> = [
    ["square", squareAdapter],
    ["shopify", shopifyAdapter],
    ["lightspeed", lightspeedAdapter],
    ["zettle", zettleAdapter],
    ["clictill", clictillAdapter],
    ["fastmag", fastmagAdapter],
];

// Adaptateurs OAuth (clictill/fastmag = token direct, getAuthUrl throw → pas de scope).
const OAUTH_ADAPTERS: Array<[string, IPOSAdapter]> = [
    ["square", squareAdapter],
    ["shopify", shopifyAdapter],
    ["lightspeed", lightspeedAdapter],
    ["zettle", zettleAdapter],
];

beforeEach(() => {
    // getAuthUrl signe un state (signState) → besoin d'un secret. Dummy si absent.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret-key";
    vi.mocked(captureError).mockClear();
});

afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.POS_WRITEBACK_ENABLED;
});

// ── Recording fetch : capture chaque requête sortante (url + method + body) ──
type Rec = { url: string; method: string; body: string };
function recordFetch(handler?: (url: string) => unknown): Rec[] {
    const calls: Rec[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: unknown, init?: RequestInit) => {
            calls.push({
                url: String(url),
                method: (init?.method ?? "GET").toUpperCase(),
                body: typeof init?.body === "string" ? init.body : init?.body ? JSON.stringify(init.body) : "",
            });
            const payload = handler ? handler(String(url)) : {};
            return {
                ok: true,
                status: 200,
                headers: { get: () => null },
                json: async () => payload,
                text: async () => "",
            } as unknown as Response;
        }),
    );
    return calls;
}

// Une requête sortante est-elle une ÉCRITURE de quantité de stock vers le POS ?
// (endpoint d'inventaire MUTANT, ou corps porteur d'une quantité/ajustement de stock)
function isInventoryWrite(rec: Rec): boolean {
    if (rec.method === "GET") return false; // une lecture n'écrit jamais
    const url = rec.url.toLowerCase();
    // Endpoints de MUTATION d'inventaire connus (≠ lecture batch-retrieve / read).
    if (
        /\/inventory\/changes\b/.test(url) || // Square BatchChangeInventory
        /\/inventory\/counts\/batch-change/.test(url) || // Square (legacy)
        /inventory_levels\/(set|adjust|connect)/.test(url) || // Shopify REST
        /\/itemshops?\b/.test(url) || // Lightspeed ItemShops (qoh)
        /inventory\.izettle\.com\/.*\/(adjust|movements?)\b/.test(url) // Zettle write
    ) {
        return true;
    }
    // Corps qui pousse une quantité/ajustement de stock vers le POS.
    const body = rec.body.toLowerCase();
    // `"available": <nombre>` = corps Shopify inventory_levels/set (on exige une valeur
    // numérique pour ne pas flagguer un champ produit innocent type "available_for_sale").
    return /"inventory_quantity"|"inventory_counts"|"quantity_change"|"physical_count"|"adjustment"|"qoh"|"available"\s*:\s*-?\d/.test(
        body,
    );
}

const SAMPLE: POSProduct[] = [
    { pos_item_id: "p1", name: "Sneaker FR 42", ean: "3401597405559", price: 99.9, category: null, photo_url: null },
];

// ─── A. Consent OAuth : pas de scope d'écriture d'inventaire ─────────────────
describe("D6.A — OAuth : aucun adaptateur ne demande l'écriture d'inventaire", () => {
    // Détecte tout token de scope « write inventory », tous POS confondus.
    function requestsInventoryWriteScope(authUrl: string): boolean {
        const u = decodeURIComponent(authUrl).toLowerCase();
        if (/inventory_write|write_inventory|write:inventory|inventory\.write/.test(u)) return true;
        // Lightspeed : `employee:inventory` (sans `_read`) = lecture+écriture stock.
        if (/employee:inventory(?![_a-z])/.test(u)) return true;
        return false;
    }

    it.each(OAUTH_ADAPTERS)("%s n'a PAS de scope d'écriture d'inventaire", (_name, adapter) => {
        const url = adapter.getAuthUrl("merchant-1");
        expect(requestsInventoryWriteScope(url)).toBe(false);
    });

    it("détecte bien un scope d'écriture (anti-test-vacant)", () => {
        // Garde-fou : si quelqu'un réintroduit INVENTORY_WRITE / write_inventory, on le voit.
        expect(requestsInventoryWriteScope("x?scope=INVENTORY_WRITE")).toBe(true);
        expect(requestsInventoryWriteScope("x?scope=read_inventory,write_inventory")).toBe(true);
        expect(requestsInventoryWriteScope("x?scope=employee:inventory")).toBe(true);
        // Les scopes de LECTURE ne doivent PAS être flaggés.
        expect(requestsInventoryWriteScope("x?scope=INVENTORY_READ")).toBe(false);
        expect(requestsInventoryWriteScope("x?scope=employee:inventory_read")).toBe(false);
    });
});

// ─── B. Surface d'API : aucune méthode d'écriture de stock exposée ───────────
describe("D6.B — surface : aucun adaptateur n'expose de méthode d'écriture de stock", () => {
    // getStock est une LECTURE (autorisée). Toute autre méthode évoquant stock/inventory/qty
    // = écriture suspecte → doit être relue (le test force la revue).
    const STOCK_WRITE_METHOD = /(set|update|push|write|adjust|sync|put|post|change)\s*(stock|inventory|qty|quantity|qoh)/i;

    it.each(ALL_ADAPTERS)("%s n'expose que getStock pour le stock", (_name, adapter) => {
        const methodNames = Object.keys(adapter).filter((k) => typeof (adapter as Record<string, unknown>)[k] === "function");
        const offenders = methodNames.filter((m) => m !== "getStock" && STOCK_WRITE_METHOD.test(m));
        expect(offenders).toEqual([]);
    });
});

// ─── C. Comportement : les écritures POS ne portent jamais de quantité de stock ──
describe("D6.C — pushCatalog n'émet aucune mutation de quantité de stock", () => {
    it("square : crée le catalogue (name/price/sku) sans toucher l'inventaire", async () => {
        const calls = recordFetch(() => ({ id_mappings: [{ client_object_id: "#p1", object_id: "SQ1" }] }));
        await squareAdapter.pushCatalog("tok", SAMPLE);
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.filter(isInventoryWrite)).toEqual([]);
        // Preuve positive : un write de CATALOGUE a bien eu lieu (sinon test vacant).
        expect(calls.some((c) => /\/catalog\//.test(c.url) && c.method === "POST")).toBe(true);
        expect(calls.some((c) => c.body.includes("Sneaker FR 42"))).toBe(true);
    });

    it("shopify : crée le produit (title/price/barcode) sans inventory_quantity", async () => {
        const calls = recordFetch(() => ({ product: { variants: [{ id: 10 }] } }));
        await shopifyAdapter.pushCatalog("tok", SAMPLE, { shopDomain: "x.myshopify.com" });
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.filter(isInventoryWrite)).toEqual([]);
        expect(calls.some((c) => /\/products\.json/.test(c.url) && c.method === "POST")).toBe(true);
        // Anti-régression explicite : pas d'inventory_quantity glissé dans le corps.
        expect(calls.every((c) => !c.body.toLowerCase().includes("inventory_quantity"))).toBe(true);
    });

    it("shopify : un échec de création (422) est rendu VISIBLE, pas droppé en silence", async () => {
        // Finding silent-failure-hunter #3 : un produit refusé par Shopify n'aurait jamais
        // de pos_item_id → ne recevrait jamais les MAJ stock du POS (perte silencieuse).
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    ({
                        ok: false,
                        status: 422,
                        headers: { get: () => null },
                        json: async () => ({}),
                        text: async () => "Unprocessable",
                    }) as unknown as Response,
            ),
        );
        const mapping = await shopifyAdapter.pushCatalog("tok", SAMPLE, { shopDomain: "x.myshopify.com" });
        expect(mapping).toEqual({}); // aucun mapping fantôme
        expect(captureError).toHaveBeenCalledTimes(1); // l'échec remonte (Sentry), pas avalé
    });

    it("lightspeed : crée l'Item (description/upc/Prices) sans toucher ItemShops/qoh", async () => {
        const calls = recordFetch((url) =>
            url.includes("/Account.json") ? { Account: { accountID: "123" } } : { Item: { itemID: "999" } },
        );
        await lightspeedAdapter.pushCatalog("tok", SAMPLE);
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.filter(isInventoryWrite)).toEqual([]);
        expect(calls.some((c) => /\/Item\.json/.test(c.url) && c.method === "POST")).toBe(true);
    });
});

// ─── D. Square updatePosProduct (writeback EAN) : flag-gardé + jamais le stock ──
describe("D6.D — updatePosProduct écrit l'EAN, jamais le stock", () => {
    it("no-op (aucun fetch) quand POS_WRITEBACK_ENABLED n'est pas 'true'", async () => {
        delete process.env.POS_WRITEBACK_ENABLED;
        const calls = recordFetch();
        const ok = await squareAdapter.updatePosProduct!("tok", "VAR1", { ean: "3401597405559" });
        expect(ok).toBe(true);
        expect(calls).toEqual([]); // aucune écriture vers le POS par défaut
    });

    it("flag ON : ne mute que le SKU (EAN), aucune écriture d'inventaire", async () => {
        process.env.POS_WRITEBACK_ENABLED = "true";
        const calls = recordFetch((url) =>
            url.includes("/catalog/object/")
                ? { object: { type: "ITEM_VARIATION", id: "VAR1", item_variation_data: { name: "x" } } }
                : {},
        );
        const ok = await squareAdapter.updatePosProduct!("tok", "VAR1", { ean: "3401597405559" });
        expect(ok).toBe(true);
        expect(calls.filter(isInventoryWrite)).toEqual([]);
        // L'unique endpoint mutant doit être le CATALOGUE (jamais /inventory/...).
        const writes = calls.filter((c) => c.method === "POST");
        expect(writes.length).toBeGreaterThan(0);
        expect(writes.every((c) => /\/catalog\/object\b/.test(c.url))).toBe(true);
        // Le corps poussé contient bien le SKU/EAN (preuve positive).
        expect(writes.some((c) => c.body.includes("3401597405559"))).toBe(true);
    });
});

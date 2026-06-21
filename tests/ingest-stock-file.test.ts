import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

vi.mock("@/lib/ingest/parse-stock", () => ({ parseStockFile: vi.fn() }));
vi.mock("@/lib/ingest/snapshot", () => ({ ingestStockSnapshot: vi.fn() }));

import { ingestStockFileForMerchant } from "@/lib/ingest/ingest-stock-file";
import { parseStockFile } from "@/lib/ingest/parse-stock";
import { ingestStockSnapshot } from "@/lib/ingest/snapshot";

/**
 * Cœur PARTAGÉ d'ingestion fichier stock (extrait de la route HTTP, réutilisé par
 * l'inbound-email). On verrouille les invariants north-star « ne rien perdre/mentir » :
 * idempotence (hash), verrou anti-concurrence, statut honnête (ok/partial/error),
 * et le heartbeat `last_file_hash` posé UNIQUEMENT si le push a abouti.
 */

type AdminCfg = { readHash?: string | null; lockRows?: unknown[] };

/** Faux admin Supabase : répond aux 3 formes de requête du cœur, capture les UPDATE. */
function makeAdmin(cfg: AdminCfg = {}) {
    const updates: Array<{ table: string; payload: any; filters: Record<string, unknown> }> = [];
    function from(table: string) {
        const state = { op: "" as "" | "select" | "update", payload: undefined as any, filters: {} as Record<string, unknown>, selectedAfterUpdate: false };
        const b: Record<string, unknown> = {};
        b.select = () => {
            if (state.op === "update") state.selectedAfterUpdate = true;
            else state.op = "select";
            return b;
        };
        b.eq = (c: string, v: unknown) => { state.filters[c] = v; return b; };
        b.or = () => b;
        b.maybeSingle = () =>
            Promise.resolve({ data: cfg.readHash != null ? { last_file_hash: cfg.readHash } : null });
        b.update = (p: unknown) => { state.op = "update"; state.payload = p; return b; };
        b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            let res: unknown;
            if (state.op === "update" && state.selectedAfterUpdate) {
                res = { data: cfg.lockRows ?? [{ merchant_id: "m1" }] }; // lock acquisition
            } else if (state.op === "update") {
                updates.push({ table, payload: state.payload, filters: state.filters });
                res = { data: null, error: null };
            } else {
                res = { data: null, error: null };
            }
            return Promise.resolve(res).then(resolve, reject);
        };
        return b;
    }
    return { client: { from } as never, updates };
}

const okSnapshot = {
    triage: { gtin_lines: 2, sku_lines: 0, rejected_lines: 0 },
    stock_replaced: 2,
    reconcile_skipped: false,
    errors: [] as unknown[],
    total_items: 2,
};

beforeEach(() => {
    vi.mocked(parseStockFile).mockReset();
    vi.mocked(ingestStockSnapshot).mockReset();
});

describe("ingestStockFileForMerchant — garde-fous d'entrée", () => {
    it("buffer vide → empty, aucune écriture", async () => {
        const { client, updates } = makeAdmin();
        const r = await ingestStockFileForMerchant(client, "m1", Buffer.from(""), "stock.csv");
        expect(r.outcome).toBe("empty");
        expect(updates).toHaveLength(0);
        expect(parseStockFile).not.toHaveBeenCalled();
    });

    it("non-tableur (PDF) → not_spreadsheet, jamais d'appel LLM/parse", async () => {
        const { client } = makeAdmin();
        const r = await ingestStockFileForMerchant(client, "m1", Buffer.from("x"), "facture.pdf");
        expect(r.outcome).toBe("not_spreadsheet");
        expect(parseStockFile).not.toHaveBeenCalled();
    });
});

describe("ingestStockFileForMerchant — idempotence & verrou", () => {
    it("même fichier que le dernier abouti (hash) → unchanged, ne reparse pas le catalogue", async () => {
        const buf = Buffer.from("ean;qty\n123;5");
        const hash = crypto.createHash("sha256").update(buf).digest("hex");
        const { client, updates } = makeAdmin({ readHash: hash });
        const r = await ingestStockFileForMerchant(client, "m1", buf, "stock.csv");
        expect(r.outcome).toBe("unchanged");
        expect(parseStockFile).not.toHaveBeenCalled();
        // touche le heartbeat sans verrou
        expect(updates.some((u) => u.payload.last_status === "ok")).toBe(true);
    });

    it("verrou déjà pris (0 ligne) → locked, ne parse pas", async () => {
        const { client } = makeAdmin({ lockRows: [] });
        const r = await ingestStockFileForMerchant(client, "m1", Buffer.from("ean;qty\n1;1"), "stock.csv");
        expect(r.outcome).toBe("locked");
        expect(parseStockFile).not.toHaveBeenCalled();
    });
});

describe("ingestStockFileForMerchant — parse & snapshot", () => {
    it("0 produit détecté → no_products + statut error + verrou relâché", async () => {
        vi.mocked(parseStockFile).mockReturnValue({ items: [] } as never);
        const { client, updates } = makeAdmin();
        const r = await ingestStockFileForMerchant(client, "m1", Buffer.from("vide"), "stock.csv");
        expect(r.outcome).toBe("no_products");
        expect(updates.some((u) => u.payload.last_status === "error")).toBe(true);
        // finally : verrou relâché
        expect(updates.some((u) => u.payload.ingesting_since === null)).toBe(true);
    });

    it("aucune ligne exploitable (ni GTIN ni SKU) → no_exploitable (jamais un faux succès)", async () => {
        vi.mocked(parseStockFile).mockReturnValue({ items: [{ name: "x" }] } as never);
        vi.mocked(ingestStockSnapshot).mockResolvedValue({
            ...okSnapshot,
            triage: { gtin_lines: 0, sku_lines: 0, rejected_lines: 3 },
        } as never);
        const { client } = makeAdmin();
        const r = await ingestStockFileForMerchant(client, "m1", Buffer.from("a;b"), "stock.csv");
        expect(r.outcome).toBe("no_exploitable");
    });

    it("succès propre → ingested/ok + last_file_hash posé (heartbeat) + verrou relâché", async () => {
        vi.mocked(parseStockFile).mockReturnValue({ items: [{ ean: "123" }, { ean: "456" }] } as never);
        vi.mocked(ingestStockSnapshot).mockResolvedValue(okSnapshot as never);
        const { client, updates } = makeAdmin();
        const r = await ingestStockFileForMerchant(client, "m1", Buffer.from("ean;qty\n123;5\n456;0"), "stock.csv");
        expect(r.outcome).toBe("ingested");
        if (r.outcome === "ingested") expect(r.status).toBe("ok");
        const finalUpd = updates.find((u) => "last_file_hash" in u.payload);
        expect(finalUpd?.payload.last_file_hash).toBeTruthy();
        expect(finalUpd?.payload.last_status).toBe("ok");
        expect(updates.some((u) => u.payload.ingesting_since === null)).toBe(true);
    });

    it("réconciliation partielle (reconcile_skipped + stock écrit) → status partial", async () => {
        vi.mocked(parseStockFile).mockReturnValue({ items: [{ ean: "123" }] } as never);
        vi.mocked(ingestStockSnapshot).mockResolvedValue({
            ...okSnapshot,
            reconcile_skipped: true,
            stock_replaced: 1,
        } as never);
        const { client } = makeAdmin();
        const r = await ingestStockFileForMerchant(client, "m1", Buffer.from("ean;qty\n123;5"), "stock.csv");
        expect(r.outcome).toBe("ingested");
        if (r.outcome === "ingested") expect(r.status).toBe("partial");
    });
});

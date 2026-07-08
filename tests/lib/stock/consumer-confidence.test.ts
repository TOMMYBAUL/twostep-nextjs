/**
 * P0-4 (2026-07-08) — Helper batch M5 des surfaces conso (`resolveConsumerConfidence`).
 *
 * Point d'entrée UNIQUE des routes de LISTE conso (discover / products/discover /
 * search / favorites / products vitrine) : lit `stock.source`/`source_ts` (migration
 * 104), les signalements récents et l'ingest en BATCH, et délègue le verdict au même
 * cœur pur `productConfidence` que products/[id]/by-ean/by-merchants → une seule vérité.
 *
 * Preuve SANS yeux/env : faux clients qui APPLIQUENT réellement les filtres
 * (.in/.eq/.gte) sur un jeu de lignes — non vacants, pas des mocks complaisants.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureErrorMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureErrorMock(...a) }));
// Le helper ne doit JAMAIS créer un vrai client admin dans les tests : on l'injecte.
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => {
        throw new Error("createAdminClient ne doit pas être appelé quand `admin` est injecté");
    },
}));

import {
    consumerM5Enabled,
    resolveConsumerConfidence,
    attachConsumerConfidence,
} from "@/lib/stock/consumer-confidence";

beforeEach(() => captureErrorMock.mockClear());

const NOW = new Date("2026-07-08T12:00:00Z");
const MIN = 60_000;

type StockRow = {
    product_id: string;
    quantity: number;
    source: string | null;
    source_ts: string | null;
    updated_at: string | null;
};

function iso(msAgo: number): string {
    return new Date(NOW.getTime() - msAgo).toISOString();
}

/** Faux client "public" : table stock uniquement, applique VRAIMENT le .in(). */
function makeSupabase(rows: StockRow[], opts?: { failIfIncludes?: string }) {
    const inCalls: string[][] = [];
    const client = {
        from(table: string) {
            if (table !== "stock") throw new Error(`table inattendue côté client public: ${table}`);
            return {
                select() {
                    return this;
                },
                in(_col: string, ids: string[]) {
                    inCalls.push(ids);
                    if (opts?.failIfIncludes && ids.includes(opts.failIfIncludes)) {
                        return Promise.resolve({ data: null, error: { message: "boom", code: "57014" } });
                    }
                    return Promise.resolve({
                        data: rows.filter((r) => ids.includes(r.product_id)),
                        error: null,
                    });
                },
            };
        },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { client: client as any, inCalls };
}

type ReportRow = { product_id: string; reason: string; created_at: string };

/** Faux client admin : ingest_credentials + stock_reports, filtres réellement appliqués. */
function makeAdmin(input: {
    ingestMerchants?: string[];
    reports?: ReportRow[];
    failIngest?: boolean;
    failReports?: boolean;
}) {
    const tableCalls: string[] = [];
    const admin = {
        from(table: string) {
            tableCalls.push(table);
            if (table === "ingest_credentials") {
                return {
                    select() {
                        return this;
                    },
                    in(_col: string, ids: string[]) {
                        if (input.failIngest) {
                            return Promise.resolve({ data: null, error: { message: "ingest boom" } });
                        }
                        return Promise.resolve({
                            data: (input.ingestMerchants ?? [])
                                .filter((m) => ids.includes(m))
                                .map((m) => ({ merchant_id: m })),
                            error: null,
                        });
                    },
                };
            }
            if (table === "stock_reports") {
                const filters: { eq?: [string, string]; gte?: [string, string] } = {};
                return {
                    select() {
                        return this;
                    },
                    eq(col: string, val: string) {
                        filters.eq = [col, val];
                        return this;
                    },
                    gte(col: string, val: string) {
                        filters.gte = [col, val];
                        return this;
                    },
                    in(_col: string, ids: string[]) {
                        if (input.failReports) {
                            return Promise.resolve({ data: null, error: { message: "reports boom" } });
                        }
                        const rows = (input.reports ?? []).filter(
                            (r) =>
                                ids.includes(r.product_id) &&
                                (!filters.eq || r.reason === filters.eq[1]) &&
                                (!filters.gte || r.created_at >= filters.gte[1]),
                        );
                        return Promise.resolve({ data: rows.map((r) => ({ product_id: r.product_id })), error: null });
                    },
                };
            }
            throw new Error(`table inattendue côté admin: ${table}`);
        },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { admin: admin as any, tableCalls };
}

describe("resolveConsumerConfidence — verdicts (même cœur M5 que products/[id])", () => {
    it("source webhook fraîche + qty saine → available « Disponible » + fraîcheur", async () => {
        const { client } = makeSupabase([
            { product_id: "p1", quantity: 5, source: "webhook", source_ts: iso(10 * MIN), updated_at: iso(5 * MIN) },
        ]);
        const { admin } = makeAdmin({});
        const map = await resolveConsumerConfidence(
            [{ productId: "p1", merchantId: "m1" }],
            { supabase: client, admin, now: NOW },
        );
        const c = map.get("p1")!;
        expect(c.state).toBe("available");
        expect(c.label).toBe("Disponible");
        expect(c.freshnessLabel).toBe("vu il y a 10 min");
    });

    it("source manual → jamais mieux que « Stock probable » (le compteur brut ne prouve rien)", async () => {
        const { client } = makeSupabase([
            { product_id: "p1", quantity: 12, source: "manual", source_ts: iso(MIN), updated_at: iso(MIN) },
        ]);
        const { admin } = makeAdmin({});
        const map = await resolveConsumerConfidence(
            [{ productId: "p1", merchantId: "m1" }],
            { supabase: client, admin, now: NOW },
        );
        expect(map.get("p1")!.state).toBe("probable");
    });

    it("produit SANS ligne stock (lecture OK) → out « Épuisé » (honnête, pas d'invention)", async () => {
        const { client } = makeSupabase([]);
        const { admin } = makeAdmin({});
        const map = await resolveConsumerConfidence(
            [{ productId: "p-absent", merchantId: "m1" }],
            { supabase: client, admin, now: NOW },
        );
        expect(map.get("p-absent")!.state).toBe("out");
    });

    it("RÉGRESSION revue SF-hunter (MED) : `reason` (interne) n'est JAMAIS émis sur le fil", async () => {
        const { client } = makeSupabase([
            { product_id: "p1", quantity: 12, source: "manual", source_ts: iso(MIN), updated_at: iso(MIN) },
        ]);
        const { admin } = makeAdmin({
            reports: [{ product_id: "p1", reason: "not_in_store", created_at: iso(10 * MIN) }],
        });
        const map = await resolveConsumerConfidence(
            [{ productId: "p1", merchantId: "m1" }],
            { supabase: client, admin, now: NOW },
        );
        const c = map.get("p1")!;
        // « manual source downgraded by 1 report(s) » trahirait signalements + absence de caisse.
        expect("reason" in c).toBe(false);
        expect(Object.keys(c).sort()).toEqual(["freshnessLabel", "label", "state"]);
    });

    it("signalements récents « not_in_store » : 1 → probable, 3 → out (le monde physique gagne)", async () => {
        const rows: StockRow[] = [
            { product_id: "p1", quantity: 9, source: "webhook", source_ts: iso(MIN), updated_at: iso(MIN) },
            { product_id: "p3", quantity: 9, source: "webhook", source_ts: iso(MIN), updated_at: iso(MIN) },
        ];
        const reports: ReportRow[] = [
            { product_id: "p1", reason: "not_in_store", created_at: iso(2 * 60 * MIN) },
            { product_id: "p3", reason: "not_in_store", created_at: iso(60 * MIN) },
            { product_id: "p3", reason: "not_in_store", created_at: iso(30 * MIN) },
            { product_id: "p3", reason: "not_in_store", created_at: iso(10 * MIN) },
            // Hors fenêtre 48 h → ignoré par le .gte réellement appliqué.
            { product_id: "p3", reason: "not_in_store", created_at: iso(100 * 60 * MIN) },
        ];
        const { client } = makeSupabase(rows);
        const { admin } = makeAdmin({ reports });
        const map = await resolveConsumerConfidence(
            [
                { productId: "p1", merchantId: "m1" },
                { productId: "p3", merchantId: "m1" },
            ],
            { supabase: client, admin, now: NOW },
        );
        expect(map.get("p1")!.state).toBe("probable");
        expect(map.get("p3")!.state).toBe("out");
    });
});

describe("resolveConsumerConfidence — échecs de lecture (jamais un verdict fabriqué)", () => {
    it("lecture stock en échec → produits ABSENTS de la Map (« pas pu vérifier » ≠ « épuisé ») + Sentry", async () => {
        const { client } = makeSupabase([], { failIfIncludes: "p1" });
        const { admin } = makeAdmin({});
        const map = await resolveConsumerConfidence(
            [
                { productId: "p1", merchantId: "m1" },
                { productId: "p2", merchantId: "m1" },
            ],
            { supabase: client, admin, now: NOW },
        );
        // Un seul lot (< 500) → les 2 produits sont dans le lot en échec.
        expect(map.has("p1")).toBe(false);
        expect(map.has("p2")).toBe(false);
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });

    it("lecture ingest_credentials en échec → fallback « pas d'ingest » (dégrade, ne surévalue JAMAIS) + Sentry", async () => {
        // Ligne legacy pré-104 : source null → le fallback structurel est consulté.
        const { client } = makeSupabase([
            { product_id: "p1", quantity: 5, source: null, source_ts: null, updated_at: iso(MIN) },
        ]);
        const { admin } = makeAdmin({ ingestMerchants: ["m1"], failIngest: true });
        const map = await resolveConsumerConfidence(
            [{ productId: "p1", merchantId: "m1" }],
            { supabase: client, admin, now: NOW },
        );
        // Avec ingest lisible, ce serait « snapshot » frais → available.
        // Sur blip : manual → probable. Jamais available sur lecture douteuse.
        expect(map.get("p1")!.state).toBe("probable");
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });

    it("TRIP-WIRE RLS (revue SF-hunter, MED) : lot ≥ 50 produits 100 % vide → « pas pu vérifier » + Sentry, JAMAIS « tout Épuisé » silencieux", async () => {
        // Régression RLS (classe 097/098) : la policy vide les résultats SANS erreur.
        const ids = Array.from({ length: 60 }, (_, i) => `p${i}`);
        const { client } = makeSupabase([]); // 0 ligne renvoyée pour 60 demandés
        const { admin } = makeAdmin({});
        const map = await resolveConsumerConfidence(
            ids.map((id) => ({ productId: id, merchantId: "m1" })),
            { supabase: client, admin, now: NOW },
        );
        // Aucun verdict « Épuisé » fabriqué : tous absents (= confidence null côté route).
        expect(map.size).toBe(0);
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
        const [err] = captureErrorMock.mock.calls[0];
        expect(String((err as Error).message)).toContain("RLS");
    });

    it("petit lot (< 50) 100 % vide = cas légitime « pas de stock » → out, 0 Sentry", async () => {
        const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
        const { client } = makeSupabase([]);
        const { admin } = makeAdmin({});
        const map = await resolveConsumerConfidence(
            ids.map((id) => ({ productId: id, merchantId: "m1" })),
            { supabase: client, admin, now: NOW },
        );
        expect(map.size).toBe(10);
        expect(map.get("p0")!.state).toBe("out");
        expect(captureErrorMock).not.toHaveBeenCalled();
    });

    it("lecture stock_reports en échec → état de base conservé + Sentry (observable, pas silencieux)", async () => {
        const { client } = makeSupabase([
            { product_id: "p1", quantity: 9, source: "webhook", source_ts: iso(MIN), updated_at: iso(MIN) },
        ]);
        const { admin } = makeAdmin({ failReports: true });
        const map = await resolveConsumerConfidence(
            [{ productId: "p1", merchantId: "m1" }],
            { supabase: client, admin, now: NOW },
        );
        expect(map.get("p1")!.state).toBe("available");
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });
});

describe("resolveConsumerConfidence — batch & économie", () => {
    it("chunking LESSONS : 1200 produits → lots .in() de 500/500/200, tous lus", async () => {
        const ids = Array.from({ length: 1200 }, (_, i) => `p${String(i).padStart(4, "0")}`);
        const rows: StockRow[] = ids.map((id) => ({
            product_id: id,
            quantity: 4,
            source: "pos_sync",
            source_ts: iso(MIN),
            updated_at: iso(MIN),
        }));
        const { client, inCalls } = makeSupabase(rows);
        const { admin } = makeAdmin({});
        const map = await resolveConsumerConfidence(
            ids.map((id) => ({ productId: id, merchantId: "m1" })),
            { supabase: client, admin, now: NOW },
        );
        expect(inCalls.map((c) => c.length)).toEqual([500, 500, 200]);
        expect(map.size).toBe(1200);
        // Le #1200 (au-delà d'un plafond naïf à 1000) est bien évalué.
        expect(map.get("p1199")!.state).toBe("available");
    });

    it("ingest_credentials n'est PAS lu quand toutes les lignes stock portent une source (économie + moins de pannes possibles)", async () => {
        const { client } = makeSupabase([
            { product_id: "p1", quantity: 5, source: "webhook", source_ts: iso(MIN), updated_at: iso(MIN) },
        ]);
        const { admin, tableCalls } = makeAdmin({});
        await resolveConsumerConfidence(
            [{ productId: "p1", merchantId: "m1" }],
            { supabase: client, admin, now: NOW },
        );
        expect(tableCalls).not.toContain("ingest_credentials");
        expect(tableCalls).toContain("stock_reports");
    });

    it("0 cible → Map vide, 0 requête", async () => {
        const { client, inCalls } = makeSupabase([]);
        const { admin, tableCalls } = makeAdmin({});
        const map = await resolveConsumerConfidence([], { supabase: client, admin, now: NOW });
        expect(map.size).toBe(0);
        expect(inCalls.length).toBe(0);
        expect(tableCalls.length).toBe(0);
    });
});

describe("attachConsumerConfidence — champ additif sur les items de liste", () => {
    it("attache le verdict par product_id ; item sans product_id → passe inchangé", async () => {
        const { client } = makeSupabase([
            { product_id: "p1", quantity: 5, source: "webhook", source_ts: iso(MIN), updated_at: iso(MIN) },
        ]);
        const { admin } = makeAdmin({});
        const items = [
            { product_id: "p1", merchant_id: "m1", product_name: "Casque" },
            { product_id: null, merchant_id: "m1", product_name: "corrompu" },
        ];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const out = await attachConsumerConfidence(items as any, { supabase: client, admin, now: NOW });
        expect(out[0].confidence?.state).toBe("available");
        expect("confidence" in out[1]).toBe(false);
    });

    it("lecture stock en échec → confidence: null (distinct de l'absence du champ = flag OFF)", async () => {
        const { client } = makeSupabase([], { failIfIncludes: "p1" });
        const { admin } = makeAdmin({});
        const out = await attachConsumerConfidence(
            [{ product_id: "p1", merchant_id: "m1" }],
            { supabase: client, admin, now: NOW },
        );
        expect(out[0].confidence).toBeNull();
    });
});

describe("consumerM5Enabled — flag de préparation P0-4", () => {
    const before = process.env.CONSUMER_M5_CONFIDENCE;
    afterEach(() => {
        if (before === undefined) delete process.env.CONSUMER_M5_CONFIDENCE;
        else process.env.CONSUMER_M5_CONFIDENCE = before;
    });

    it("OFF par défaut (0 changement prod tant que Thomas n'a pas jugé le rendu)", () => {
        delete process.env.CONSUMER_M5_CONFIDENCE;
        expect(consumerM5Enabled()).toBe(false);
        process.env.CONSUMER_M5_CONFIDENCE = "0";
        expect(consumerM5Enabled()).toBe(false);
    });

    it("ON seulement sur la valeur exacte « 1 »", () => {
        process.env.CONSUMER_M5_CONFIDENCE = "1";
        expect(consumerM5Enabled()).toBe(true);
    });
});

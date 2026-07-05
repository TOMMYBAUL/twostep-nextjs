/**
 * P0-11 (2026-07-05) — SKU match SCOPÉ AU MARCHAND + garde longueur.
 *
 * Bug fermé : la stratégie « SKU match » de l'enrichissement (adopter l'EAN d'un
 * autre produit partageant le SKU quand aucun EAN n'est déclaré) N'ÉTAIT PAS scopée
 * par marchand → le marchand B héritait l'EAN (donc photo/marque/catégorie) d'un
 * produit du marchand A partageant le même SKU interne ("TS-0042") = FAUSSE identité
 * cross-marchand (« zéro faux positif » = cœur north-star). Deux instances (enrich-
 * product.ts + resolve-ean.ts) → unifiées dans `findSharedSkuEan` (source unique).
 *
 * Preuve SANS yeux/env : fake Supabase qui APPLIQUE vraiment les filtres .eq/.neq/.not
 * sur un jeu de lignes (non vacant) → prouve le scope marchand, pas un mock complaisant.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const captureErrorMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureErrorMock(...a) }));

import { isSpecificSku, findSharedSkuEan, MIN_SKU_IDENTITY_LENGTH } from "@/lib/enrichment/sku-identity";

beforeEach(() => captureErrorMock.mockClear());

type Row = { id: string; merchant_id: string; sku: string | null; ean: string | null };
type Call = [string, unknown[]];

function makeAdmin(rows: Row[], forceError?: { code?: string }) {
    const queries: Call[][] = [];
    const admin = {
        from(table: string) {
            const calls: Call[] = [];
            queries.push(calls);
            const builder: Record<string, unknown> = {};
            const chain = (name: string) => (...args: unknown[]) => {
                calls.push([name, args]);
                return builder;
            };
            for (const m of ["select", "eq", "neq", "not", "limit"]) builder[m] = chain(m);
            builder.single = () => {
                calls.push(["single", []]);
                if (forceError) return Promise.resolve({ data: null, error: forceError });
                if (table !== "products") return Promise.resolve({ data: null, error: null });
                let result = rows;
                for (const [op, args] of calls) {
                    if (op === "eq") result = result.filter((r) => (r as Record<string, unknown>)[args[0] as string] === args[1]);
                    else if (op === "neq") result = result.filter((r) => (r as Record<string, unknown>)[args[0] as string] !== args[1]);
                    else if (op === "not" && args[1] === "is" && args[2] === null)
                        result = result.filter((r) => (r as Record<string, unknown>)[args[0] as string] !== null);
                }
                const row = result[0] ?? null;
                // .single() : 0 ligne → PGRST116 (data null), comme PostgREST.
                return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { code: "PGRST116" } });
            };
            return builder;
        },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { admin: admin as any, queries };
}

describe("isSpecificSku", () => {
    it("seuil = 4 chars (source unique)", () => {
        expect(MIN_SKU_IDENTITY_LENGTH).toBe(4);
    });
    it("null/undefined/vide → false", () => {
        expect(isSpecificSku(null)).toBe(false);
        expect(isSpecificSku(undefined)).toBe(false);
        expect(isSpecificSku("")).toBe(false);
    });
    it("trop court (<4 après trim) → false", () => {
        expect(isSpecificSku("1")).toBe(false);
        expect(isSpecificSku("AB")).toBe(false);
        expect(isSpecificSku("abc")).toBe(false); // 3 chars
        expect(isSpecificSku("  a  ")).toBe(false); // trim → 1
    });
    it("≥4 chars → true", () => {
        expect(isSpecificSku("abcd")).toBe(true);
        expect(isSpecificSku("TS-0042")).toBe(true);
        expect(isSpecificSku("  abcd  ")).toBe(true); // trim → 4
    });
});

describe("findSharedSkuEan — scope marchand (P0-11)", () => {
    it("CROSS-MARCHAND : ne récupère PAS l'EAN d'un produit d'un autre marchand au même SKU", async () => {
        // Marchand A possède le SKU TS-0042 + EAN ; le marchand B enrichit son produit
        // (même SKU, pas d'EAN). Avant le fix : B héritait l'EAN de A = fausse identité.
        const { admin, queries } = makeAdmin([
            { id: "pA", merchant_id: "MA", sku: "TS-0042", ean: "3401579802345" },
            { id: "pB", merchant_id: "MB", sku: "TS-0042", ean: null },
        ]);
        const ean = await findSharedSkuEan(admin, "MB", "TS-0042", "pB");
        expect(ean).toBeNull();
        // Verrou de régression : la requête DOIT filtrer sur merchant_id du marchand courant.
        const products = queries.find((c) => c.some(([op]) => op === "select"))!;
        expect(products).toContainEqual(["eq", ["merchant_id", "MB"]]);
        expect(products).toContainEqual(["eq", ["sku", "TS-0042"]]);
        expect(products).toContainEqual(["neq", ["id", "pB"]]);
        expect(products).toContainEqual(["not", ["ean", "is", null]]);
    });

    it("MÊME MARCHAND : récupère bien l'EAN d'un jumeau au même SKU (feature intacte)", async () => {
        const { admin } = makeAdmin([
            { id: "pB1", merchant_id: "MB", sku: "REF-999", ean: "3401579802345" }, // jumeau avec EAN
            { id: "pB2", merchant_id: "MB", sku: "REF-999", ean: null }, // produit enrichi
        ]);
        const ean = await findSharedSkuEan(admin, "MB", "REF-999", "pB2");
        expect(ean).toBe("3401579802345");
    });

    it("SKU trop court → aucune requête DB (ne peut ancrer une identité)", async () => {
        const { admin, queries } = makeAdmin([
            { id: "pB1", merchant_id: "MB", sku: "12", ean: "3401579802345" },
            { id: "pB2", merchant_id: "MB", sku: "12", ean: null },
        ]);
        const ean = await findSharedSkuEan(admin, "MB", "12", "pB2");
        expect(ean).toBeNull();
        expect(queries.length).toBe(0); // court-circuit avant tout appel DB
    });

    it("SKU null → null, aucune requête", async () => {
        const { admin, queries } = makeAdmin([]);
        expect(await findSharedSkuEan(admin, "MB", null, "pB2")).toBeNull();
        expect(queries.length).toBe(0);
    });

    it("0 jumeau (PGRST116) → null conservateur, AUCUN Sentry (cas nominal)", async () => {
        // Aucune ligne ne matche → PGRST116 → helper renvoie null sans logguer (jamais un
        // EAN inventé, et pas de bruit Sentry sur le cas courant « pas de SKU partagé »).
        const { admin } = makeAdmin([
            { id: "pX", merchant_id: "MA", sku: "AUTRE", ean: "9999999999999" },
        ]);
        expect(await findSharedSkuEan(admin, "MB", "TS-0042", "pB2")).toBeNull();
        expect(captureErrorMock).not.toHaveBeenCalled();
    });

    it("vrai blip DB (code ≠ PGRST116) → null + Sentry (outage rendu visible)", async () => {
        // Un outage ne doit PAS se lire « pas de SKU partagé » en silence.
        const { admin } = makeAdmin([], { code: "57014" }); // statement_timeout
        expect(await findSharedSkuEan(admin, "MB", "TS-0042", "pB2")).toBeNull();
        expect(captureErrorMock).toHaveBeenCalledTimes(1);
    });
});

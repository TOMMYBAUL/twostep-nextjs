import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * P0-6 — migration 110 : `update_stock_atomic` renvoie `(previous, written)` au lieu du seul
 * `previous`. `written` = le stock a RÉELLEMENT changé (ni rejet temporel, ni no-op).
 *
 * Bug (104/109) : la RPC renvoyait `v_previous` indistinctement que l'écriture ait eu lieu ou
 * non. Les routes webhook + /api/stock déduisent un feed_event (sale/restock) + une notification
 * « de retour en stock » à partir de `previousQty` seul → sur un absolu PÉRIMÉ rejeté par la
 * garde 104 (DB fraîche épuisée, événement out-of-order positif) elles émettaient un « restock »
 * FANTÔME + spammaient les favoris sur un produit réellement épuisé.
 *
 * Deux niveaux de preuve, SANS exécuter la migration (fichier sur disque seulement) :
 *  1. Modèle TS ligne-à-ligne du corps 110 → `written` correct sur tous les cas (stale-reject,
 *     no-op, changement réel, insert) + subsomption de la 109 (GREATEST source_ts en delta).
 *  2. Assertions sur le FICHIER SQL réel (110_stock_written_flag.sql).
 */

// ─── 1. Modèle de la logique plpgsql (110) ────────────────────────────────────

interface StockRow {
    quantity: number;
    source: string;
    source_ts: number;
}
interface Call {
    quantity: number;
    mode: "absolute" | "delta";
    source: string;
    sourceTs: number;
}
interface Result {
    row: StockRow;
    previous: number;
    written: boolean;
}

/** Miroir du corps de `update_stock_atomic` version 110. */
function updateStockAtomicModel110(row: StockRow | null, call: Call): Result {
    if (row === null) {
        // Première ligne de stock : écriture réelle (previous conceptuel = 0).
        return {
            row: { quantity: Math.max(0, call.quantity), source: call.source, source_ts: call.sourceTs },
            previous: 0,
            written: true,
        };
    }

    let newQty: number;
    let newTs: number;
    if (call.mode === "delta") {
        newQty = Math.max(0, row.quantity + call.quantity);
        newTs = Math.max(row.source_ts, call.sourceTs); // subsume 109 (GREATEST)
    } else {
        if (call.sourceTs < row.source_ts) {
            // Rejet temporel : AUCUNE écriture → written=false.
            return { row, previous: row.quantity, written: false };
        }
        newQty = Math.max(0, call.quantity);
        newTs = call.sourceTs;
    }
    return {
        row: { quantity: newQty, source: call.source, source_ts: newTs },
        previous: row.quantity,
        // written = le stock a réellement changé (pas de no-op).
        written: newQty !== row.quantity,
    };
}

const T1 = 1_000;
const T2 = 2_000;
const T3 = 3_000;

describe("P0-6 — modèle update_stock_atomic 110 : sémantique de `written`", () => {
    const fresh: StockRow = { quantity: 10, source: "webhook", source_ts: T2 };
    const empty: StockRow = { quantity: 0, source: "webhook", source_ts: T2 };

    it("absolu PÉRIMÉ rejeté (sourceTs < base) → written=false, stock inchangé", () => {
        const r = updateStockAtomicModel110(empty, { quantity: 8, mode: "absolute", source: "pos_sync", sourceTs: T1 });
        expect(r.written).toBe(false); // ← le garde P0-6
        expect(r.previous).toBe(0);
        expect(r.row.quantity).toBe(0); // le stock reste la vérité fraîche (épuisé)
    });

    it("absolu frais qui CHANGE la quantité → written=true", () => {
        const r = updateStockAtomicModel110(empty, { quantity: 8, mode: "absolute", source: "webhook", sourceTs: T3 });
        expect(r.written).toBe(true);
        expect(r.row.quantity).toBe(8);
        expect(r.previous).toBe(0);
    });

    it("absolu frais qui NE change PAS la quantité (retry même valeur) → written=false", () => {
        const r = updateStockAtomicModel110(fresh, { quantity: 10, mode: "absolute", source: "webhook", sourceTs: T3 });
        expect(r.written).toBe(false); // pas de « sale »/« restock » fantôme au retry
        expect(r.row.quantity).toBe(10);
    });

    it("delta réel (vente -1) → written=true", () => {
        const r = updateStockAtomicModel110(fresh, { quantity: -1, mode: "delta", source: "webhook", sourceTs: T3 });
        expect(r.written).toBe(true);
        expect(r.row.quantity).toBe(9);
        expect(r.previous).toBe(10);
    });

    it("delta no-op (stock déjà à 0, delta -1 clampé) → written=false", () => {
        const r = updateStockAtomicModel110(empty, { quantity: -1, mode: "delta", source: "webhook", sourceTs: T3 });
        expect(r.written).toBe(false); // clampé à 0 = pas de changement = pas d'événement
        expect(r.row.quantity).toBe(0);
    });

    it("INSERT (ligne stock absente) → written=true, previous=0", () => {
        const r = updateStockAtomicModel110(null, { quantity: 4, mode: "delta", source: "webhook", sourceTs: T1 });
        expect(r.written).toBe(true);
        expect(r.previous).toBe(0);
        expect(r.row.quantity).toBe(4);
    });

    it("subsume la 109 : un delta retardé (@T1 < base T2) ne fait PAS reculer source_ts", () => {
        const r = updateStockAtomicModel110(fresh, { quantity: -1, mode: "delta", source: "webhook", sourceTs: T1 });
        expect(r.row.source_ts).toBe(T2); // GREATEST(v_prev_ts, p_source_ts)
        expect(r.row.quantity).toBe(9); // le décrément s'applique quand même
    });
});

// ─── 2. Le FICHIER SQL livré porte bien ce contrat ────────────────────────────

describe("P0-6 — 110_stock_written_flag.sql (fichier, non appliqué)", () => {
    const sql = readFileSync(resolve(__dirname, "../supabase/migrations/110_stock_written_flag.sql"), "utf8");

    it("RETURNS TABLE(previous int, written boolean) — nouveau contrat de sortie", () => {
        expect(sql).toMatch(/RETURNS TABLE\(previous int, written boolean\)/);
    });

    it("DROP FUNCTION de la signature 5-args AVANT CREATE (changement de type de retour)", () => {
        expect(sql).toMatch(/DROP FUNCTION IF EXISTS update_stock_atomic\(uuid, int, text, text, timestamptz\)/);
        // Arguments INCHANGÉS (5 args mêmes noms/types/DEFAULT → pas d'overload PGRST203).
        expect(sql).toMatch(
            /CREATE FUNCTION update_stock_atomic\(\s*p_product_id uuid,\s*p_quantity int,\s*p_mode text DEFAULT 'absolute',\s*p_source text DEFAULT 'manual',\s*p_source_ts timestamptz DEFAULT now\(\)\s*\)/,
        );
    });

    it("transaction-wrappée (BEGIN/COMMIT) → DDL atomique, pas de fenêtre 'fonction absente'", () => {
        expect(sql).toMatch(/^\s*BEGIN;/m);
        expect(sql).toMatch(/^\s*COMMIT;/m);
    });

    it("stale-reject → written=false ; no-op détecté via IS DISTINCT FROM ; insert → written=true", () => {
        expect(sql).toContain("RETURN QUERY SELECT v_previous, false;");
        expect(sql).toContain("v_new IS DISTINCT FROM v_previous");
        expect(sql).toContain("RETURN QUERY SELECT 0, true;");
    });

    it("subsume la 109 : GREATEST(v_prev_ts, p_source_ts) dans la branche delta", () => {
        const deltaBranch = sql.match(/IF p_mode = 'delta' THEN([\s\S]*?)ELSE/);
        expect(deltaBranch).not.toBeNull();
        expect(deltaBranch![1]).toContain("GREATEST(v_prev_ts, p_source_ts)");
    });

    it("durci (revue DB HIGH) : lock_timeout pour échouer vite plutôt que jammer la file RPC", () => {
        expect(sql).toMatch(/SET LOCAL lock_timeout = '3s';/);
    });

    it("durci (revue DB/SF CRITIQUE) : re-REVOKE EXECUTE anon/authenticated (DROP+CREATE réinit l'ACL à PUBLIC)", () => {
        expect(sql).toMatch(
            /REVOKE EXECUTE ON FUNCTION public\.update_stock_atomic\(uuid, int, text, text, timestamptz\) FROM anon, authenticated;/,
        );
    });
});

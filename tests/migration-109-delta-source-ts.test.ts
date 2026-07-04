import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * P0-5 — migration 109 : en mode `delta`, `update_stock_atomic` ne doit plus faire
 * RECULER `source_ts`.
 *
 * Bug (104) : l'UPDATE écrivait `source_ts = p_source_ts` inconditionnellement →
 * un delta webhook livré EN RETARD (source_ts ancien) reculait la fraîcheur stockée,
 * ce qui rouvrait la porte à un REPLACE périmé (`p_source_ts < v_prev_ts` ne le
 * bloquait plus) → une vérité plus fraîche écrasée = faux stock silencieux.
 *
 * Deux niveaux de preuve, SANS exécuter la migration (fichier sur disque seulement) :
 *  1. Modèle TS ligne-à-ligne des corps 104 et 109 → le scénario « delta retardé puis
 *     REPLACE périmé » reproduit le bug sous 104 et prouve qu'il est fermé sous 109.
 *  2. Assertions sur le FICHIER SQL réel (109_fix_delta_source_ts.sql) : signature
 *     IDENTIQUE (5 args, RETURNS int, pas de DROP → pas d'overload PGRST203),
 *     `GREATEST(v_prev_ts, p_source_ts)` présent dans la branche delta, garde
 *     absolue conservée — pour lier le modèle au fichier livré.
 */

// ─── 1. Modèle de la logique plpgsql (104 vs 109) ─────────────────────────────
// Timestamps en millisecondes epoch (l'ordre est tout ce qui compte).

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

/** Miroir du corps de `update_stock_atomic` — `fix109` bascule 104 → 109. */
function updateStockAtomicModel(row: StockRow | null, call: Call, fix109: boolean): { row: StockRow; returned: number } {
    // IF NOT FOUND → INSERT
    if (row === null) {
        return {
            row: { quantity: Math.max(0, call.quantity), source: call.source, source_ts: call.sourceTs },
            returned: 0,
        };
    }

    let newQty: number;
    let newTs: number;
    if (call.mode === "delta") {
        newQty = Math.max(0, row.quantity + call.quantity);
        // 104 : source_ts = p_source_ts (recule possible) ; 109 : GREATEST(v_prev_ts, p_source_ts).
        newTs = fix109 ? Math.max(row.source_ts, call.sourceTs) : call.sourceTs;
    } else {
        // REPLACE absolu : garde anti-régression (identique 104/109).
        if (call.sourceTs < row.source_ts) {
            return { row, returned: row.quantity };
        }
        newQty = Math.max(0, call.quantity);
        newTs = call.sourceTs;
    }
    return { row: { quantity: newQty, source: call.source, source_ts: newTs }, returned: row.quantity };
}

const T1 = 1_000; // heure du delta RETARDÉ (le plus ancien)
const T1_5 = 1_500; // heure du REPLACE périmé
const T2 = 2_000; // heure de la vérité FRAÎCHE en base
const T3 = 3_000; // delta à l'heure (plus frais que la base)

describe("P0-5 — modèle update_stock_atomic : delta retardé ne recule plus source_ts", () => {
    // État initial : vérité fraîche posée par un absolu @T2 (10 unités).
    const fresh: StockRow = { quantity: 10, source: "webhook", source_ts: T2 };

    it("BUG 104 (reproduit) : delta retardé @T1 recule source_ts → un REPLACE périmé @T1.5 écrase la vérité fraîche", () => {
        const afterDelta = updateStockAtomicModel(fresh, { quantity: -1, mode: "delta", source: "webhook", sourceTs: T1 }, false);
        expect(afterDelta.row.source_ts).toBe(T1); // ← le recul, cœur du bug

        // REPLACE périmé (@T1.5 < T2) : la garde aurait dû le rejeter, mais compare à T1.
        const afterStale = updateStockAtomicModel(afterDelta.row, { quantity: 99, mode: "absolute", source: "pos_sync", sourceTs: T1_5 }, false);
        expect(afterStale.row.quantity).toBe(99); // vérité fraîche ÉCRASÉE par du périmé
    });

    it("FIX 109 : delta retardé @T1 conserve source_ts=T2 → le REPLACE périmé @T1.5 est REJETÉ", () => {
        const afterDelta = updateStockAtomicModel(fresh, { quantity: -1, mode: "delta", source: "webhook", sourceTs: T1 }, true);
        // Le delta S'APPLIQUE toujours (le décrément de la vente est réel)…
        expect(afterDelta.row.quantity).toBe(9);
        expect(afterDelta.returned).toBe(10);
        // …mais la fraîcheur ne recule pas.
        expect(afterDelta.row.source_ts).toBe(T2);

        // Le REPLACE périmé bute maintenant sur la garde (T1.5 < T2) → no-op.
        const afterStale = updateStockAtomicModel(afterDelta.row, { quantity: 99, mode: "absolute", source: "pos_sync", sourceTs: T1_5 }, true);
        expect(afterStale.row.quantity).toBe(9); // vérité préservée
        expect(afterStale.returned).toBe(9); // RETURN v_previous (contrat int inchangé)
    });

    it("FIX 109 : un delta À L'HEURE (@T3 > T2) fait AVANCER source_ts (GREATEST prend le plus récent)", () => {
        const afterDelta = updateStockAtomicModel(fresh, { quantity: -1, mode: "delta", source: "webhook", sourceTs: T3 }, true);
        expect(afterDelta.row.quantity).toBe(9);
        expect(afterDelta.row.source_ts).toBe(T3);
    });

    it("FIX 109 : modes INSERT et absolu-frais INCHANGÉS par rapport à 104", () => {
        // INSERT (ligne stock absente)
        const ins104 = updateStockAtomicModel(null, { quantity: 4, mode: "delta", source: "webhook", sourceTs: T1 }, false);
        const ins109 = updateStockAtomicModel(null, { quantity: 4, mode: "delta", source: "webhook", sourceTs: T1 }, true);
        expect(ins109).toEqual(ins104);

        // REPLACE frais (@T3 > T2) : appliqué identiquement.
        const abs104 = updateStockAtomicModel(fresh, { quantity: 7, mode: "absolute", source: "pos_sync", sourceTs: T3 }, false);
        const abs109 = updateStockAtomicModel(fresh, { quantity: 7, mode: "absolute", source: "pos_sync", sourceTs: T3 }, true);
        expect(abs109).toEqual(abs104);
    });
});

// ─── 2. Le FICHIER SQL livré porte bien ce contrat ────────────────────────────

describe("P0-5 — 109_fix_delta_source_ts.sql (fichier, non appliqué)", () => {
    const sql = readFileSync(resolve(__dirname, "../supabase/migrations/109_fix_delta_source_ts.sql"), "utf8");

    it("signature IDENTIQUE à la 104 : 5 args mêmes noms/types/DEFAULT, RETURNS int", () => {
        expect(sql).toMatch(
            /CREATE OR REPLACE FUNCTION update_stock_atomic\(\s*p_product_id uuid,\s*p_quantity int,\s*p_mode text DEFAULT 'absolute',\s*p_source text DEFAULT 'manual',\s*p_source_ts timestamptz DEFAULT now\(\)\s*\)\s*RETURNS int/,
        );
    });

    it("pas de DROP FUNCTION ni de changement d'arité → aucun risque d'overload PGRST203", () => {
        expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
        // Une seule définition de la fonction dans le fichier.
        expect(sql.match(/CREATE OR REPLACE FUNCTION update_stock_atomic/g)).toHaveLength(1);
    });

    it("branche delta : source_ts ne recule plus (GREATEST(v_prev_ts, p_source_ts))", () => {
        // Le GREATEST est bien DANS la branche delta (entre IF p_mode = 'delta' et ELSE).
        const deltaBranch = sql.match(/IF p_mode = 'delta' THEN([\s\S]*?)ELSE/);
        expect(deltaBranch).not.toBeNull();
        expect(deltaBranch![1]).toContain("GREATEST(v_prev_ts, p_source_ts)");
        // Et l'UPDATE écrit la valeur calculée, plus le p_source_ts brut.
        expect(sql).toMatch(/UPDATE stock\s+SET quantity = v_new, updated_at = now\(\), source = p_source, source_ts = v_source_ts/);
    });

    it("garde anti-régression du mode absolu CONSERVÉE (comportement 104 intact)", () => {
        expect(sql).toContain("IF p_source_ts < v_prev_ts THEN");
        expect(sql).toContain("RETURN v_previous;");
    });
});

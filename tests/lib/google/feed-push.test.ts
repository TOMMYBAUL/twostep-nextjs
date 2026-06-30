import { describe, it, expect, vi } from "vitest";
import { processWithinTimeBudget } from "@/lib/google/feed-push";

/**
 * SCALE / VOLUME — `processWithinTimeBudget` borne le push du feed Google au budget temps
 * Vercel pour qu'un gros catalogue ne tue PAS la fonction en plein vol (priorities §1bis
 * item #4 « timeouts crons/routes Vercel »). On prouve la sémantique d'interruption SANS
 * réseau ni horloge réelle : horloge + action injectées → déterministe.
 *
 * Invariant north-star : à l'interruption, `interrupted=true` ET `attempted < items.length`
 * → l'appelant écrit un statut HONNÊTE (« partial »), jamais un faux « success » ni un
 * skip silencieux. « ne rien perdre silencieusement — impossible sans alerte ».
 */

/** Horloge déterministe : avance de `step` ms à CHAQUE lecture (simule le temps qui passe). */
function fakeClock(start: number, step: number): () => number {
    let t = start;
    return () => {
        const v = t;
        t += step;
        return v;
    };
}

describe("processWithinTimeBudget", () => {
    it("traite TOUS les items quand le budget n'est jamais atteint (succès complet)", async () => {
        const items = [1, 2, 3, 4, 5];
        const seen: number[] = [];
        const res = await processWithinTimeBudget(
            items,
            async (n) => {
                seen.push(n);
                return true;
            },
            // horloge figée bien sous le deadline → jamais d'interruption
            { now: () => 0, deadlineMs: 1_000 },
        );

        expect(seen).toEqual([1, 2, 3, 4, 5]);
        expect(res).toEqual({ succeeded: 5, attempted: 5, interrupted: false });
    });

    it("liste vide → rien à faire, PAS une interruption", async () => {
        const action = vi.fn(async () => true);
        const res = await processWithinTimeBudget([], action, { now: () => 0, deadlineMs: 1_000 });

        expect(action).not.toHaveBeenCalled();
        expect(res).toEqual({ succeeded: 0, attempted: 0, interrupted: false });
    });

    it("compte les succès et les échecs capturés séparément (attempted = succès + échecs)", async () => {
        const items = [1, 2, 3, 4];
        const res = await processWithinTimeBudget(
            items,
            // 2 et 4 échouent (action renvoie false), 1 et 3 réussissent
            async (n) => n % 2 === 1,
            { now: () => 0, deadlineMs: 1_000 },
        );

        // Tout est tenté (pas d'interruption) ; seuls les impairs réussissent.
        expect(res).toEqual({ succeeded: 2, attempted: 4, interrupted: false });
    });

    it("S'ARRÊTE au deadline atteint en plein milieu → interrupted, attempted < total", async () => {
        const items = [10, 20, 30, 40, 50];
        const seen: number[] = [];
        // L'horloge démarre à 0 et avance de 100 ms par lecture. Le check a lieu AVANT chaque
        // item : lectures à 0, 100, 200, 300 (< 300 ? non : 300 >= 300) → coupe au 4e item.
        const res = await processWithinTimeBudget(
            items,
            async (n) => {
                seen.push(n);
                return true;
            },
            { now: fakeClock(0, 100), deadlineMs: 300 },
        );

        // Items traités : 10 (t=0), 20 (t=100), 30 (t=200). Au 4e, t=300 >= 300 → STOP.
        expect(seen).toEqual([10, 20, 30]);
        expect(res).toEqual({ succeeded: 3, attempted: 3, interrupted: true });
        // L'invariant qui ferme la perte silencieuse : on N'A PAS tout tenté.
        expect(res.attempted).toBeLessThan(items.length);
    });

    it("deadline déjà dépassé AVANT le 1er item (liste non vide) → attempted 0, interrupted", async () => {
        const action = vi.fn(async () => true);
        const res = await processWithinTimeBudget([1, 2, 3], action, {
            now: () => 10_000, // déjà au-delà
            deadlineMs: 5_000,
        });

        expect(action).not.toHaveBeenCalled();
        expect(res).toEqual({ succeeded: 0, attempted: 0, interrupted: true });
    });

    it("un item entamé est mené à terme (le check est AVANT l'item, jamais en plein milieu)", async () => {
        // L'horloge ne passe le deadline qu'APRÈS le 2e check ; le 2e item, une fois commencé,
        // s'exécute en entier même si l'action est lente (pas de coupe en plein appel réseau).
        const completed: number[] = [];
        const res = await processWithinTimeBudget(
            [1, 2, 3],
            async (n) => {
                // simule une action async non instantanée
                await Promise.resolve();
                completed.push(n);
                return true;
            },
            { now: fakeClock(0, 200), deadlineMs: 300 },
        );

        // checks à t=0 (ok), t=200 (ok), t=400 (>=300 → stop) → items 1 et 2 complétés entièrement.
        expect(completed).toEqual([1, 2]);
        expect(res).toEqual({ succeeded: 2, attempted: 2, interrupted: true });
    });
});

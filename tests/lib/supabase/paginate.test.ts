import { describe, it, expect } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { fetchAllRows, streamRows, SUPABASE_MAX_ROWS } from "@/lib/supabase/paginate";

/**
 * Preuve de la garde anti-troncature `max-rows` de PostgREST (défaut Supabase 1000).
 * Sans pagination, une lecture non bornée renvoie SILENCIEUSEMENT au plus 1000
 * lignes → perte silencieuse n°1 (doublons à l'ingestion, vendus jamais remis à 0).
 *
 * On simule une requête Supabase paginable : un dataset fini fenêtré par `.range()`,
 * chaque fenêtre PLAFONNÉE à `pageSize` (= comportement réel de PostgREST, qui
 * tronque même une `.range()` plus large que `max-rows`). On prouve que `fetchAllRows`
 * récupère TOUTES les lignes quel que soit le nombre, propage les erreurs, et ne
 * masque jamais une lecture incomplète.
 */

type Row = { id: number };

/**
 * Fabrique une requête simulant PostgREST sur `total` lignes (id 0..total-1).
 * `.range(from, to)` renvoie la fenêtre [from, to], elle-même tronquée à `cap`
 * lignes (cap = max-rows réel). `calls` compte les requêtes émises.
 */
function makeQueryFactory(total: number, cap: number) {
    const calls: Array<{ from: number; to: number }> = [];
    const make = () => ({
        range(from: number, to: number) {
            calls.push({ from, to });
            const window = Math.min(to, total - 1);
            const rows: Row[] = [];
            // Fenêtre demandée [from..to], puis plafond `cap` (troncature max-rows).
            for (let i = from; i <= window && rows.length < cap; i++) rows.push({ id: i });
            return Promise.resolve({ data: rows as Row[] | null, error: null as PostgrestError | null });
        },
    });
    return { make, calls };
}

describe("fetchAllRows — anti-troncature max-rows PostgREST", () => {
    it("récupère TOUTES les lignes au-delà d'une page (cas > max-rows)", async () => {
        // 2500 lignes, pageSize 1000 = au-delà du défaut Supabase → 3 pages.
        const { make, calls } = makeQueryFactory(2500, 1000);
        const { data, error } = await fetchAllRows<Row>(make, 1000);

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data!).toHaveLength(2500); // AUCUNE ligne perdue
        // Couverture complète sans trou ni doublon.
        expect(data!.map((r) => r.id)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
        expect(calls).toHaveLength(3); // [0..999] [1000..1999] [2000..2999]→500
    });

    it("multiple EXACT de pageSize : refait un tour pour voir la page vide finale", async () => {
        const { make, calls } = makeQueryFactory(2000, 1000);
        const { data } = await fetchAllRows<Row>(make, 1000);

        expect(data!).toHaveLength(2000);
        // 2 pages pleines (1000+1000) + 1 page vide pour confirmer la fin.
        expect(calls).toHaveLength(3);
        expect(calls[2]).toEqual({ from: 2000, to: 2999 });
    });

    it("une seule page (dataset < pageSize) : 1 requête, pas de tour supplémentaire", async () => {
        const { make, calls } = makeQueryFactory(42, 1000);
        const { data } = await fetchAllRows<Row>(make, 1000);

        expect(data!).toHaveLength(42);
        expect(calls).toHaveLength(1);
    });

    it("dataset vide → [] en une requête (jamais null sur 0 ligne)", async () => {
        const { make, calls } = makeQueryFactory(0, 1000);
        const { data, error } = await fetchAllRows<Row>(make, 1000);

        expect(error).toBeNull();
        expect(data).toEqual([]);
        expect(calls).toHaveLength(1);
    });

    it("erreur sur la 1re page → propagée, AUCUN résultat partiel masqué", async () => {
        const err = { message: "boom", code: "X", details: "", hint: "" } as PostgrestError;
        let n = 0;
        const make = () => ({
            range: () => {
                n++;
                return Promise.resolve({ data: null as Row[] | null, error: err });
            },
        });
        const { data, error } = await fetchAllRows<Row>(make, 1000);

        expect(error).toBe(err);
        expect(data).toBeNull();
        expect(n).toBe(1); // on s'arrête immédiatement
    });

    it("erreur sur une page ULTÉRIEURE → propagée (pas de troncature silencieuse en succès)", async () => {
        const err = { message: "boom-page2", code: "X", details: "", hint: "" } as PostgrestError;
        let call = 0;
        const make = () => ({
            range: (from: number, to: number) => {
                call++;
                if (call === 1) {
                    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: from + i }));
                    return Promise.resolve({ data: rows as Row[] | null, error: null as PostgrestError | null });
                }
                return Promise.resolve({ data: null as Row[] | null, error: err });
            },
        });
        const { data, error } = await fetchAllRows<Row>(make, 1000);

        // Le succès partiel (1re page OK) ne doit PAS masquer l'échec de la suite.
        expect(error).toBe(err);
        expect(data).toBeNull();
    });

    it("data null sans erreur à la 1re page (anomalie SDK) → ERREUR (fail-loud, jamais index vide masqué)", async () => {
        const make = () => ({
            range: () => Promise.resolve({ data: null as Row[] | null, error: null as PostgrestError | null }),
        });
        const { data, error } = await fetchAllRows<Row>(make, 1000);

        // null sans error = anomalie → on la transforme en erreur pour que l'appelant
        // (snapshot : existingErr→throw, inStockErr→captureError+skip) ne prenne PAS un
        // index vide pour un catalogue vide (sinon doublons / réconciliation no-op).
        expect(data).toBeNull();
        expect(error).not.toBeNull();
        expect(error!.code).toBe("PGRST_NULL_DATA");
    });

    it("data null sans erreur sur une page ULTÉRIEURE → ERREUR (pas de set PARTIEL en succès)", async () => {
        let call = 0;
        const make = () => ({
            range: (from: number) => {
                call++;
                if (call === 1) {
                    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: from + i }));
                    return Promise.resolve({ data: rows as Row[] | null, error: null as PostgrestError | null });
                }
                // 2e page : null sans erreur (anomalie) — NE DOIT PAS renvoyer les 1000 premiers en succès.
                return Promise.resolve({ data: null as Row[] | null, error: null as PostgrestError | null });
            },
        });
        const { data, error } = await fetchAllRows<Row>(make, 1000);

        expect(data).toBeNull(); // surtout pas les 1000 premières lignes présentées comme complètes
        expect(error).not.toBeNull();
        expect(error!.code).toBe("PGRST_NULL_DATA");
    });

    it("pageSize invalide (< 1) → lève (anti boucle infinie)", async () => {
        const { make } = makeQueryFactory(10, 1000);
        await expect(fetchAllRows<Row>(make, 0)).rejects.toThrow(/pageSize/);
    });

    it("constante exportée = défaut PostgREST Supabase", () => {
        expect(SUPABASE_MAX_ROWS).toBe(1000);
    });
});

describe("streamRows — pagination STREAMING (mémoire bornée à une page)", () => {
    it("émet chaque page lazily et couvre TOUT le dataset (cas > max-rows)", async () => {
        const { make, calls } = makeQueryFactory(2500, 1000);
        const seen: number[] = [];
        const pageSizes: number[] = [];
        for await (const page of streamRows<Row>(make, 1000)) {
            pageSizes.push(page.length);
            for (const r of page) seen.push(r.id);
        }
        expect(seen).toEqual(Array.from({ length: 2500 }, (_, i) => i)); // 0 perte
        expect(pageSizes).toEqual([1000, 1000, 500]); // 3 pages
        expect(calls).toHaveLength(3);
    });

    it("LAZY : ne lit la page N+1 que lorsqu'on la consomme (mémoire = 1 page)", async () => {
        const { make, calls } = makeQueryFactory(2500, 1000);
        const gen = streamRows<Row>(make, 1000);
        expect(calls).toHaveLength(0); // rien n'est lu avant la 1re demande
        await gen.next();
        expect(calls).toHaveLength(1); // exactement 1 page chargée
        await gen.next();
        expect(calls).toHaveLength(2); // la 2e seulement à la 2e demande
    });

    it("multiple EXACT de pageSize : page vide finale pour confirmer la fin", async () => {
        const { make, calls } = makeQueryFactory(2000, 1000);
        const pageSizes: number[] = [];
        for await (const page of streamRows<Row>(make, 1000)) pageSizes.push(page.length);
        expect(pageSizes).toEqual([1000, 1000, 0]);
        expect(calls).toHaveLength(3);
    });

    it("dataset vide → une seule page [] (jamais null sur 0 ligne)", async () => {
        const { make, calls } = makeQueryFactory(0, 1000);
        const pages: Row[][] = [];
        for await (const page of streamRows<Row>(make, 1000)) pages.push(page);
        expect(pages).toEqual([[]]);
        expect(calls).toHaveLength(1);
    });

    it("erreur de lecture → LÈVE (jamais un flux partiel passé pour complet)", async () => {
        const err = { message: "boom-page2", code: "X", details: "", hint: "" } as PostgrestError;
        let call = 0;
        const make = () => ({
            range: (from: number) => {
                call++;
                if (call === 1) {
                    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: from + i }));
                    return Promise.resolve({ data: rows as Row[] | null, error: null as PostgrestError | null });
                }
                return Promise.resolve({ data: null as Row[] | null, error: err });
            },
        });
        const gen = streamRows<Row>(make, 1000);
        await gen.next(); // page 1 OK
        // page 2 erreur → throw (le consommateur streaming doit AVORTER, pas finir « complet »)
        await expect(gen.next()).rejects.toThrow(/streamRows.*offset 1000/);
    });

    it("erreur : `.cause` préserve le PostgrestError d'origine (diagnostic)", async () => {
        const err = { message: "rls denied", code: "42501", details: "", hint: "" } as PostgrestError;
        const make = () => ({
            range: () => Promise.resolve({ data: null as Row[] | null, error: err }),
        });
        await streamRows<Row>(make, 1000)
            .next()
            .then(
                () => expect.fail("aurait dû lever"),
                (e: unknown) => expect((e as Error).cause).toBe(err),
            );
    });

    it("data null sans erreur (anomalie SDK) → LÈVE (fail-loud, jamais troncature masquée)", async () => {
        const make = () => ({
            range: () => Promise.resolve({ data: null as Row[] | null, error: null as PostgrestError | null }),
        });
        await expect(streamRows<Row>(make, 1000).next()).rejects.toThrow(/data=null/);
    });

    it("pageSize invalide (< 1) → lève (anti boucle infinie)", async () => {
        const { make } = makeQueryFactory(10, 1000);
        await expect(streamRows<Row>(make, 0).next()).rejects.toThrow(/pageSize/);
    });
});

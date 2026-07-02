import { describe, it, expect } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { fetchAllRows, streamRows, SUPABASE_MAX_ROWS } from "@/lib/supabase/paginate";

/**
 * Preuve de la garde anti-troncature `max-rows` de PostgREST (défaut Supabase 1000),
 * en pagination **KEYSET** (`WHERE column > curseur ORDER BY column LIMIT pageSize`).
 * Sans pagination, une lecture non bornée renvoie SILENCIEUSEMENT au plus 1000
 * lignes → perte silencieuse n°1 (doublons à l'ingestion, vendus jamais remis à 0).
 *
 * On simule une requête Supabase paginable par keyset : un dataset fini borné par
 * `.gt(column, curseur)` (borne basse EXCLUSIVE), chaque fenêtre PLAFONNÉE à `pageSize`
 * (= `max-rows` réel). On prouve que le helper récupère TOUTES les lignes quel que soit
 * le nombre, PAGINE PAR CURSEUR (pas par offset → dérive-immune), propage les erreurs,
 * et ne masque jamais une lecture incomplète.
 */

type Row = { id: number };

/**
 * Fabrique une requête simulant PostgREST KEYSET sur `total` lignes (id 0..total-1).
 * `.gt("id", curseur)` fixe la borne basse exclusive ; `.limit(n)` renvoie au plus
 * min(n, cap) lignes d'id > curseur (cap = max-rows réel). `calls` enregistre le
 * curseur `after` de chaque requête → prouve que l'on pagine par VALEUR, pas par
 * position (une lecture keyset ne dépend d'aucun offset décalable).
 */
function makeQueryFactory(total: number, cap: number) {
    const calls: Array<{ after: number | null; limit: number }> = [];
    const make = () => {
        let after: number | null = null;
        const q = {
            gt(_column: string, value: number) {
                after = value;
                return q;
            },
            limit(count: number) {
                calls.push({ after, limit: count });
                const start = after === null ? 0 : after + 1;
                const window = Math.min(count, cap);
                const rows: Row[] = [];
                for (let i = start; i < total && rows.length < window; i++) rows.push({ id: i });
                return Promise.resolve({ data: rows as Row[] | null, error: null as PostgrestError | null });
            },
        };
        return q;
    };
    return { make, calls };
}

describe("fetchAllRows — anti-troncature max-rows PostgREST (KEYSET)", () => {
    it("récupère TOUTES les lignes au-delà d'une page (cas > max-rows)", async () => {
        // 2500 lignes, pageSize 1000 = au-delà du défaut Supabase → 3 pages.
        const { make, calls } = makeQueryFactory(2500, 1000);
        const { data, error } = await fetchAllRows<Row>(make, { pageSize: 1000 });

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data!).toHaveLength(2500); // AUCUNE ligne perdue
        // Couverture complète sans trou ni doublon.
        expect(data!.map((r) => r.id)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
        // Pagination PAR CURSEUR : 1re page sans borne, puis `.gt` sur le dernier id vu.
        expect(calls.map((c) => c.after)).toEqual([null, 999, 1999]);
    });

    it("multiple EXACT de pageSize : refait un tour pour voir la page vide finale", async () => {
        const { make, calls } = makeQueryFactory(2000, 1000);
        const { data } = await fetchAllRows<Row>(make, { pageSize: 1000 });

        expect(data!).toHaveLength(2000);
        // 2 pages pleines (curseur null puis 999) + 1 tour final (curseur 1999) → vide.
        expect(calls.map((c) => c.after)).toEqual([null, 999, 1999]);
    });

    it("une seule page (dataset < pageSize) : 1 requête, pas de tour supplémentaire", async () => {
        const { make, calls } = makeQueryFactory(42, 1000);
        const { data } = await fetchAllRows<Row>(make, { pageSize: 1000 });

        expect(data!).toHaveLength(42);
        expect(calls).toHaveLength(1);
    });

    it("dataset vide → [] en une requête (jamais null sur 0 ligne)", async () => {
        const { make, calls } = makeQueryFactory(0, 1000);
        const { data, error } = await fetchAllRows<Row>(make, { pageSize: 1000 });

        expect(error).toBeNull();
        expect(data).toEqual([]);
        expect(calls).toHaveLength(1);
    });

    it("colonne-curseur configurable (ex. product_id de la réconciliation stock)", async () => {
        // Le helper doit lire le curseur sur la colonne fournie, pas « id ».
        type StockRow = { product_id: number };
        const total = 2100;
        const calls: number[] = [];
        const make = () => {
            let after: number | null = null;
            const q = {
                gt(column: string, value: number) {
                    expect(column).toBe("product_id"); // borne posée sur la BONNE colonne
                    after = value;
                    return q;
                },
                limit(count: number) {
                    const start = after === null ? 0 : after + 1;
                    calls.push(after ?? -1);
                    const rows: StockRow[] = [];
                    for (let i = start; i < total && rows.length < count; i++) rows.push({ product_id: i });
                    return Promise.resolve({ data: rows as StockRow[] | null, error: null as PostgrestError | null });
                },
            };
            return q;
        };
        const { data, error } = await fetchAllRows<StockRow>(make, { pageSize: 1000, column: "product_id" });

        expect(error).toBeNull();
        expect(data!).toHaveLength(2100);
        expect(calls).toEqual([-1, 999, 1999]); // curseur pris sur product_id
    });

    it("erreur sur la 1re page → propagée, AUCUN résultat partiel masqué", async () => {
        const err = { message: "boom", code: "X", details: "", hint: "" } as PostgrestError;
        let n = 0;
        const make = () => ({
            gt() {
                return make();
            },
            limit: () => {
                n++;
                return Promise.resolve({ data: null as Row[] | null, error: err });
            },
        });
        const { data, error } = await fetchAllRows<Row>(make, { pageSize: 1000 });

        expect(error).toBe(err);
        expect(data).toBeNull();
        expect(n).toBe(1); // on s'arrête immédiatement
    });

    it("erreur sur une page ULTÉRIEURE → propagée (pas de troncature silencieuse en succès)", async () => {
        const err = { message: "boom-page2", code: "X", details: "", hint: "" } as PostgrestError;
        let call = 0;
        const make = () => {
            let after: number | null = null;
            const q = {
                gt(_c: string, v: number) {
                    after = v;
                    return q;
                },
                limit: () => {
                    call++;
                    if (call === 1) {
                        const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
                        return Promise.resolve({ data: rows as Row[] | null, error: null as PostgrestError | null });
                    }
                    expect(after).toBe(999); // 2e page bornée par le dernier id vu
                    return Promise.resolve({ data: null as Row[] | null, error: err });
                },
            };
            return q;
        };
        const { data, error } = await fetchAllRows<Row>(make, { pageSize: 1000 });

        // Le succès partiel (1re page OK) ne doit PAS masquer l'échec de la suite.
        expect(error).toBe(err);
        expect(data).toBeNull();
    });

    it("data null sans erreur à la 1re page (anomalie SDK) → ERREUR (fail-loud, jamais index vide masqué)", async () => {
        const make = () => ({
            gt() {
                return make();
            },
            limit: () => Promise.resolve({ data: null as Row[] | null, error: null as PostgrestError | null }),
        });
        const { data, error } = await fetchAllRows<Row>(make, { pageSize: 1000 });

        // null sans error = anomalie → on la transforme en erreur pour que l'appelant
        // (snapshot : existingErr→throw, inStockErr→captureError+skip) ne prenne PAS un
        // index vide pour un catalogue vide (sinon doublons / réconciliation no-op).
        expect(data).toBeNull();
        expect(error).not.toBeNull();
        expect(error!.code).toBe("PGRST_NULL_DATA");
    });

    it("data null sans erreur sur une page ULTÉRIEURE → ERREUR (pas de set PARTIEL en succès)", async () => {
        let call = 0;
        const make = () => {
            const q = {
                gt() {
                    return q;
                },
                limit: () => {
                    call++;
                    if (call === 1) {
                        const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
                        return Promise.resolve({ data: rows as Row[] | null, error: null as PostgrestError | null });
                    }
                    // 2e page : null sans erreur (anomalie) — NE DOIT PAS renvoyer les 1000 premiers en succès.
                    return Promise.resolve({ data: null as Row[] | null, error: null as PostgrestError | null });
                },
            };
            return q;
        };
        const { data, error } = await fetchAllRows<Row>(make, { pageSize: 1000 });

        expect(data).toBeNull(); // surtout pas les 1000 premières lignes présentées comme complètes
        expect(error).not.toBeNull();
        expect(error!.code).toBe("PGRST_NULL_DATA");
    });

    it("curseur absent/null sur une page PLEINE → ERREUR (fail-loud : pagination keyset impossible)", async () => {
        // Une page pleine dont la dernière ligne n'a pas de colonne-curseur exploitable
        // (colonne non lue / NULL) → on NE PEUT PAS borner la page suivante : plutôt que
        // boucler à l'infini ou tronquer, on échoue fort.
        const make = () => ({
            gt() {
                return make();
            },
            // page pleine (1000) mais sans champ `id` → curseur introuvable.
            limit: () =>
                Promise.resolve({
                    data: Array.from({ length: 1000 }, () => ({}) as unknown as Row),
                    error: null as PostgrestError | null,
                }),
        });
        const { data, error } = await fetchAllRows<Row>(make, { pageSize: 1000 });

        expect(data).toBeNull();
        expect(error).not.toBeNull();
        expect(error!.code).toBe("PGRST_NULL_DATA");
    });

    it("pageSize invalide (< 1) → lève (anti boucle infinie)", async () => {
        const { make } = makeQueryFactory(10, 1000);
        await expect(fetchAllRows<Row>(make, { pageSize: 0 })).rejects.toThrow(/pageSize/);
    });

    it("constante exportée = défaut PostgREST Supabase", () => {
        expect(SUPABASE_MAX_ROWS).toBe(1000);
    });
});

describe("streamRows — pagination STREAMING KEYSET (mémoire bornée à une page)", () => {
    it("émet chaque page lazily et couvre TOUT le dataset (cas > max-rows)", async () => {
        const { make, calls } = makeQueryFactory(2500, 1000);
        const seen: number[] = [];
        const pageSizes: number[] = [];
        for await (const page of streamRows<Row>(make, { pageSize: 1000 })) {
            pageSizes.push(page.length);
            for (const r of page) seen.push(r.id);
        }
        expect(seen).toEqual(Array.from({ length: 2500 }, (_, i) => i)); // 0 perte
        expect(pageSizes).toEqual([1000, 1000, 500]); // 3 pages
        expect(calls.map((c) => c.after)).toEqual([null, 999, 1999]); // par curseur
    });

    it("LAZY : ne lit la page N+1 que lorsqu'on la consomme (mémoire = 1 page)", async () => {
        const { make, calls } = makeQueryFactory(2500, 1000);
        const gen = streamRows<Row>(make, { pageSize: 1000 });
        expect(calls).toHaveLength(0); // rien n'est lu avant la 1re demande
        await gen.next();
        expect(calls).toHaveLength(1); // exactement 1 page chargée
        await gen.next();
        expect(calls).toHaveLength(2); // la 2e seulement à la 2e demande
    });

    it("multiple EXACT de pageSize : page vide finale pour confirmer la fin", async () => {
        const { make, calls } = makeQueryFactory(2000, 1000);
        const pageSizes: number[] = [];
        for await (const page of streamRows<Row>(make, { pageSize: 1000 })) pageSizes.push(page.length);
        expect(pageSizes).toEqual([1000, 1000, 0]);
        expect(calls.map((c) => c.after)).toEqual([null, 999, 1999]);
    });

    it("dataset vide → une seule page [] (jamais null sur 0 ligne)", async () => {
        const { make, calls } = makeQueryFactory(0, 1000);
        const pages: Row[][] = [];
        for await (const page of streamRows<Row>(make, { pageSize: 1000 })) pages.push(page);
        expect(pages).toEqual([[]]);
        expect(calls).toHaveLength(1);
    });

    it("erreur de lecture → LÈVE (jamais un flux partiel passé pour complet)", async () => {
        const err = { message: "boom-page2", code: "X", details: "", hint: "" } as PostgrestError;
        let call = 0;
        const make = () => {
            const q = {
                gt() {
                    return q;
                },
                limit: () => {
                    call++;
                    if (call === 1) {
                        const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
                        return Promise.resolve({ data: rows as Row[] | null, error: null as PostgrestError | null });
                    }
                    return Promise.resolve({ data: null as Row[] | null, error: err });
                },
            };
            return q;
        };
        const gen = streamRows<Row>(make, { pageSize: 1000 });
        await gen.next(); // page 1 OK
        // page 2 erreur → throw (le consommateur streaming doit AVORTER, pas finir « complet »)
        await expect(gen.next()).rejects.toThrow(/streamRows.*curseur 999/);
    });

    it("erreur : `.cause` préserve le PostgrestError d'origine (diagnostic)", async () => {
        const err = { message: "rls denied", code: "42501", details: "", hint: "" } as PostgrestError;
        const make = () => ({
            gt() {
                return make();
            },
            limit: () => Promise.resolve({ data: null as Row[] | null, error: err }),
        });
        await streamRows<Row>(make, { pageSize: 1000 })
            .next()
            .then(
                () => expect.fail("aurait dû lever"),
                (e: unknown) => expect((e as Error).cause).toBe(err),
            );
    });

    it("data null sans erreur (anomalie SDK) → LÈVE (fail-loud, jamais troncature masquée)", async () => {
        const make = () => ({
            gt() {
                return make();
            },
            limit: () => Promise.resolve({ data: null as Row[] | null, error: null as PostgrestError | null }),
        });
        await expect(streamRows<Row>(make, { pageSize: 1000 }).next()).rejects.toThrow(/data=null/);
    });

    it("curseur absent/null sur une page PLEINE → LÈVE au tour suivant (pagination keyset impossible)", async () => {
        const make = () => ({
            gt() {
                return make();
            },
            limit: () =>
                Promise.resolve({
                    data: Array.from({ length: 1000 }, () => ({}) as unknown as Row),
                    error: null as PostgrestError | null,
                }),
        });
        // La 1re page (pleine) est émise ; c'est en tentant de borner la SUIVANTE (curseur
        // introuvable) que le flux AVORTE — jamais un flux « complet » silencieusement tronqué.
        const gen = streamRows<Row>(make, { pageSize: 1000 });
        await gen.next();
        await expect(gen.next()).rejects.toThrow(/curseur "id" absent/);
    });

    it("pageSize invalide (< 1) → lève (anti boucle infinie)", async () => {
        const { make } = makeQueryFactory(10, 1000);
        await expect(streamRows<Row>(make, { pageSize: 0 }).next()).rejects.toThrow(/pageSize/);
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * SCALE / VOLUME — le cron `google-feed` (Voie A) doit s'arrêter PROPREMENT avant le kill
 * Vercel sur un gros catalogue et écrire un statut HONNÊTE, jamais une troncature SILENCIEUSE
 * (priorities §1bis item #4 « timeouts crons/routes Vercel »).
 *
 * Régression de la perte n°1 : AVANT, le push bouclait N appels réseau séquentiels sans
 * borne de temps → Vercel tuait la fonction en plein vol → produits restants OMIS + l'écriture
 * de `last_feed_status` (en fin de boucle) JAMAIS atteinte → le marchand restait sur le
 * « success » du run précédent (feed partiel, aucun signal). On drive le VRAI POST avec une
 * horloge contrôlée : quand le budget est dépassé en plein marchand, le statut écrit DOIT être
 * "partial" (interrompu), `time_budget_exhausted:true`, et les marchands non traités signalés.
 */

const h = {
    updates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
    googleFetchCount: 0,
    connections: [] as Array<Record<string, unknown>>,
    catalogSize: 0,
    // delta de temps virtuel ajouté à chaque push Google (simule la latence réseau)
    msPerPush: 0,
    // Curseur keyset d'entrée de chaque page `products` lue (prouve la pagination STREAMING
    // KEYSET : on lit page par page par VALEUR d'id, et on cesse de lire dès l'interruption).
    pageCursors: [] as Array<string | null>,
    // Si posé (curseur non-null), la lecture products à ce curseur ÉCHOUE (simule un blip DB
    // sur une page N>0 APRÈS que des pages antérieures ont déjà été poussées).
    errorAtCursor: null as string | null,
};

let virtualNow = 0;

const captureErrorMock = vi.fn();
vi.mock("@/lib/error", () => ({ captureError: (...a: unknown[]) => captureErrorMock(...a) }));
vi.mock("@/lib/google/merchant", () => ({
    getGoogleAccessToken: vi.fn(async () => ({
        connection: { google_merchant_id: "acc-1" },
        accessToken: "tok",
    })),
    googleMerchantFetch: vi.fn(async () => {
        h.googleFetchCount++;
        virtualNow += h.msPerPush; // le temps « passe » à chaque appel réseau
        return {};
    }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));

function makeProducts(): Array<Record<string, unknown>> {
    return Array.from({ length: h.catalogSize }, (_, i) => ({
        id: `p${String(i).padStart(5, "0")}`,
        name: `Produit ${i}`,
        canonical_name: `Produit ${i}`,
        description: "desc",
        brand: "ACME",
        ean: "1234567890123",
        price: 9.99,
        photo_url: "https://img/x.jpg",
        photo_processed_url: null,
        visible: true,
        review_status: "validated",
        archived_at: null,
        variant_of: null,
        stock: [{ quantity: 5 }],
        promotions: [],
    }));
}

/** Faux client : products paginé via KEYSET (`.gt`/`.limit`), update connections dans h.updates. */
function makeClient() {
    const products = makeProducts(); // triés par id (padStart → ordre lexical = numérique)

    function builder(table: string) {
        const st = {
            single: false,
            cursor: null as string | null,
            limitN: null as number | null,
            op: "select" as "select" | "update",
            payload: null as Record<string, unknown> | null,
            eqId: null as string | null,
        };

        const resolve = () => {
            if (table === "products") {
                h.pageCursors.push(st.cursor);
                // Blip DB sur une page ULTÉRIEURE (curseur non-null) → fail-loud (streamRows lève).
                if (h.errorAtCursor !== null && st.cursor === h.errorAtCursor) {
                    return { data: null, error: { message: "db blip", code: "XX000", details: "", hint: "", name: "PostgrestError" } };
                }
                let rows = products;
                // KEYSET : borne basse EXCLUSIVE par valeur d'id (dérive-immune), cap min(limit, 1000).
                if (st.cursor != null) rows = rows.filter((r) => (r.id as string) > st.cursor!);
                const cap = Math.min(st.limitN ?? 1000, 1000);
                if (rows.length > cap) rows = rows.slice(0, cap);
                return { data: rows, error: null };
            }
            if (table === "google_merchant_connections") {
                if (st.op === "update") {
                    h.updates.push({ id: st.eqId ?? "?", payload: st.payload ?? {} });
                    // A5 : persiste le curseur dans h.connections → un callCron ULTÉRIEUR reprend
                    // là où le précédent s'est arrêté (preuve que la queue AVANCE d'un run à l'autre).
                    const c = h.connections.find((x) => x.merchant_id === st.eqId);
                    if (c && st.payload && "last_feed_cursor" in st.payload) {
                        c.last_feed_cursor = st.payload.last_feed_cursor;
                    }
                    return { data: null, error: null };
                }
                return { data: h.connections, error: null };
            }
            return { data: null, error: null };
        };

        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = (col: string, val: string) => {
            if (col === "merchant_id") st.eqId = val;
            return b;
        };
        b.is = () => b;
        b.order = () => b;
        b.update = (payload: Record<string, unknown>) => {
            st.op = "update";
            st.payload = payload;
            return b;
        };
        b.gt = (col: string, val: unknown) => {
            if (col === "id") st.cursor = val as string;
            return b;
        };
        b.limit = (n: number) => {
            st.limitN = n;
            return b;
        };
        // A5 : lecture du curseur de reprise (`.select("last_feed_cursor").eq(...).maybeSingle()`)
        // → renvoie la connexion unique du marchand (avec son last_feed_cursor), ou null.
        b.maybeSingle = () => {
            const c = h.connections.find((x) => x.merchant_id === st.eqId) ?? null;
            return Promise.resolve({ data: c, error: null });
        };
        b.then = (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) =>
            Promise.resolve(resolve()).then(ok, err);
        return b;
    }

    return { from: (table: string) => builder(table) } as never;
}

beforeEach(() => {
    h.updates = [];
    h.googleFetchCount = 0;
    h.connections = [];
    h.catalogSize = 0;
    h.msPerPush = 0;
    h.pageCursors = [];
    h.errorAtCursor = null;
    virtualNow = 1_000_000;
    captureErrorMock.mockClear();
    process.env.CRON_SECRET = "secret";
    // A5 : flag de reprise OFF par défaut → les tests existants gardent le comportement actuel
    // (curseur jamais lu/écrit). Les tests A5 le posent explicitement.
    delete process.env.FEED_RESUME_CURSOR;
    // Horloge contrôlée : ne « passe » que via h.msPerPush (dans googleMerchantFetch).
    vi.spyOn(Date, "now").mockImplementation(() => virtualNow);
});

afterEach(() => {
    vi.restoreAllMocks();
});

async function callCron() {
    const { POST } = await import("@/app/api/cron/google-feed/route");
    const req = new Request("http://x/api/cron/google-feed", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
    }) as never;
    const res = await POST(req);
    return (res as Response).json();
}

describe("google-feed — budget temps (anti-troncature silencieuse Vercel)", () => {
    it("budget non atteint → push complet, statut 'success', pas d'interruption", async () => {
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111" }];
        h.catalogSize = 5;
        h.msPerPush = 0; // le temps ne passe pas → jamais d'interruption

        const json = await callCron();

        expect(h.googleFetchCount).toBe(5);
        expect(json.products_pushed).toBe(5);
        expect(json.time_budget_exhausted).toBe(false);
        expect(json.merchants_attempted).toBe(1);
        const upd = h.updates.find((u) => u.id === "m-1")!;
        expect(upd.payload.last_feed_status).toBe("success");
        expect(upd.payload.last_feed_error).toBeNull();
        expect(upd.payload.products_pushed).toBe(5);

        // Non-régression : aucun signal time-budget quand le run finit dans les temps.
        const tbCalls = captureErrorMock.mock.calls.filter(
            (c) => (c[1] as Record<string, unknown> | undefined)?.step === "time-budget",
        );
        expect(tbCalls.length).toBe(0);
    });

    it("budget dépassé en plein marchand → statut 'partial' HONNÊTE (jamais 'success' silencieux)", async () => {
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111" }];
        h.catalogSize = 5;
        // deadline = 1_000_000 + 270_000. 100_000 ms/push → checks à 1.0M,1.1M,1.2M (ok) puis
        // 1.3M ≥ 1.27M → STOP au 4e produit. 3 poussés, 2 non tentés.
        h.msPerPush = 100_000;

        const json = await callCron();

        expect(h.googleFetchCount).toBe(3); // seulement 3 appels réseau, pas 5
        expect(json.products_pushed).toBe(3);
        expect(json.time_budget_exhausted).toBe(true);
        expect(json.merchants_attempted).toBe(1);

        const upd = h.updates.find((u) => u.id === "m-1")!;
        expect(upd.payload.last_feed_status).toBe("partial"); // PAS "success"
        expect(upd.payload.products_pushed).toBe(3);
        expect(String(upd.payload.last_feed_error)).toContain("budget temps");
        // En streaming interrompu le TOTAL éligible est inconnu (pages restantes non lues) →
        // le message dit ce qui a été poussé + qu'il a été interrompu, jamais un faux "X/Y".
        expect(String(upd.payload.last_feed_error)).toContain("3 produit");
        expect(String(upd.payload.last_feed_error)).toContain("catalogue trop gros");

        // Pilote MONO-marchand : l'interruption en plein push DOIT quand même alerter Sentry
        // (regression finding #3 : l'ancien garde `< length` ne tirait rien ici).
        const tbCalls = captureErrorMock.mock.calls.filter(
            (c) => (c[1] as Record<string, unknown> | undefined)?.step === "time-budget",
        );
        expect(tbCalls.length).toBe(1);
        expect(String((tbCalls[0][0] as Error).message)).toContain("budget temps épuisé");
    });

    it("budget dépassé → marchand suivant NON démarré + signalé à Sentry (jamais un feed périmé muet)", async () => {
        h.connections = [
            { merchant_id: "m-1", store_code: "twostep-aaaa1111" },
            { merchant_id: "m-2", store_code: "twostep-bbbb2222" },
        ];
        h.catalogSize = 5;
        h.msPerPush = 100_000;

        const json = await callCron();

        // m-1 interrompu → break → m-2 jamais tenté.
        expect(json.merchants).toBe(2);
        expect(json.merchants_attempted).toBe(1);
        expect(json.time_budget_exhausted).toBe(true);

        // m-1 a un statut écrit (partial) ; m-2 n'a AUCUN update (statut du run précédent intact).
        expect(h.updates.some((u) => u.id === "m-1")).toBe(true);
        expect(h.updates.some((u) => u.id === "m-2")).toBe(false);

        // Le marchand non rafraîchi est rendu VISIBLE (Sentry), jamais silencieux.
        const sentryCalls = captureErrorMock.mock.calls.filter(
            (c) => (c[1] as Record<string, unknown> | undefined)?.step === "time-budget",
        );
        expect(sentryCalls.length).toBe(1);
        expect(String((sentryCalls[0][0] as Error).message)).toContain("1/2");
        expect(String((sentryCalls[0][0] as Error).message)).toContain("1 non démarré");
        expect((sentryCalls[0][1] as Record<string, unknown>).merchantsSkipped).toBe(1);
    });

    it("catalogue >1000 → lu et poussé en STREAMING page par page (mémoire bornée, 0 troncature)", async () => {
        // 2500 produits = 3 pages PostgREST (1000+1000+500). Sans interruption, tout est poussé
        // et la lecture passe par KEYSET page par page (jamais un SELECT unique non borné,
        // tronqué à 1000, ni tout le catalogue matérialisé en RAM).
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111" }];
        h.catalogSize = 2500;
        h.msPerPush = 0; // le temps ne passe pas → jamais d'interruption

        const json = await callCron();

        // Les 2500 produits sont poussés à Google (0 troncature silencieuse à 1000).
        expect(h.googleFetchCount).toBe(2500);
        expect(json.products_pushed).toBe(2500);
        expect(json.time_budget_exhausted).toBe(false);

        // La lecture a été PAGINÉE en KEYSET (streaming) : 3 pages, curseurs dérive-immunes.
        expect(h.pageCursors).toEqual([null, "p00999", "p01999"]);

        const upd = h.updates.find((u) => u.id === "m-1")!;
        expect(upd.payload.last_feed_status).toBe("success");
        expect(upd.payload.products_pushed).toBe(2500);
    });

    it("interruption à mi-catalogue → les pages non poussées ne sont même PAS lues (bonus streaming)", async () => {
        // 2500 produits, ~200 ms/push → deadline (270 000 ms) atteint après ~1350 pushes, en
        // pleine 2e page. La 3e page (curseur "p01999") ne doit JAMAIS être lue : on cesse de
        // tirer le générateur `streamRows` dès l'interruption → 0 lecture superflue.
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111" }];
        h.catalogSize = 2500;
        h.msPerPush = 200;

        const json = await callCron();

        // 1350 poussés (1_000_000 + 200×1350 = 1_270_000 = deadline → stop au 1351e).
        expect(h.googleFetchCount).toBe(1350);
        expect(json.products_pushed).toBe(1350);
        expect(json.time_budget_exhausted).toBe(true);

        // Pages 0 et 1 lues (items 0..1349 traversent la page 1) ; page 2 JAMAIS demandée.
        expect(h.pageCursors).toEqual([null, "p00999"]);
        expect(h.pageCursors.some((c) => c === "p01999")).toBe(false);

        const upd = h.updates.find((u) => u.id === "m-1")!;
        expect(upd.payload.last_feed_status).toBe("partial");
        expect(upd.payload.products_pushed).toBe(1350);
    });

    it("échec de lecture d'une page ULTÉRIEURE → statut 'error' + products_pushed = poussés AVANT l'échec (jamais stale)", async () => {
        // streamRows lève (fail-loud) sur une erreur DB à la 2e page (curseur "p00999"), APRÈS que
        // la page 0 (1000 produits) a déjà été poussée à Google. Le catch doit écrire "error" ET le
        // nombre RÉELLEMENT poussé ce run (1000), pas le products_pushed périmé du run précédent.
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111" }];
        h.catalogSize = 2500;
        h.msPerPush = 0;
        h.errorAtCursor = "p00999"; // 2e page (curseur du dernier id de la page 0 pleine) échoue

        const json = await callCron();

        expect(h.googleFetchCount).toBe(1000); // page 0 poussée, puis lecture page 1 échoue
        const upd = h.updates.find((u) => u.id === "m-1")!;
        expect(upd.payload.last_feed_status).toBe("error"); // fail-loud, jamais faux "success"
        expect(upd.payload.products_pushed).toBe(1000); // honnête : poussés avant l'échec
        expect(json.products_pushed).toBe(1000); // résumé reflète les push réels
        expect(json.errors).toBe(1);

        // La lecture incomplète est rendue VISIBLE (Sentry), jamais un feed silencieusement périmé.
        expect(captureErrorMock).toHaveBeenCalled();
    });
});

/**
 * A5 — CHECKPOINT / REPRISE (flag `FEED_RESUME_CURSOR=1`). SANS reprise, un catalogue dont
 * le push complet dépasse le budget temps redémarre à `id=0` à chaque run → la QUEUE n'est
 * JAMAIS atteinte = famine silencieuse (perte n°1 du north-star). Avec reprise : le run
 * suivant démarre AU-DELÀ du dernier produit poussé → la queue avance ; un cycle bouclé remet
 * le curseur à NULL (ré-affirmation depuis la tête). Le flag OFF ne référence JAMAIS la colonne
 * `last_feed_cursor` (sûr avant la migration 111).
 */
describe("google-feed — reprise A5 (anti-famine de la queue, checkpoint curseur)", () => {
    it("flag OFF → colonne last_feed_cursor JAMAIS écrite (sûr avant migration 111)", async () => {
        // Régression : sans le flag, le statut écrit ne doit contenir AUCUNE clé last_feed_cursor
        // (la migration 111 n'est pas appliquée en prod → référencer la colonne casserait l'UPDATE).
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111" }];
        h.catalogSize = 3;
        h.msPerPush = 0;

        await callCron();

        // Le curseur est écrit dans un UPDATE SÉPARÉ (isolé du statut) — flag OFF → AUCUN update
        // ne doit référencer la colonne (sûr avant la migration 111 : la référencer casserait l'UPDATE).
        expect(h.updates.some((u) => "last_feed_cursor" in u.payload)).toBe(false);
        // Le write de statut, lui, a bien eu lieu (observabilité intacte).
        expect(h.updates.some((u) => u.id === "m-1" && u.payload.last_feed_status === "success")).toBe(true);
    });

    it("flag ON, cycle complet → curseur remis à NULL (ré-affirmation depuis la tête)", async () => {
        process.env.FEED_RESUME_CURSOR = "1";
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111", last_feed_cursor: null }];
        h.catalogSize = 5;
        h.msPerPush = 0; // pas d'interruption → tout poussé → cycle bouclé

        const json = await callCron();

        expect(h.googleFetchCount).toBe(5);
        expect(json.time_budget_exhausted).toBe(false);
        // Statut et curseur = 2 UPDATE distincts (isolation observabilité / curseur).
        const statusUpd = h.updates.find((u) => u.id === "m-1" && "last_feed_status" in u.payload)!;
        expect(statusUpd.payload.last_feed_status).toBe("success");
        const cursorUpd = h.updates.find((u) => u.id === "m-1" && "last_feed_cursor" in u.payload)!;
        // Cycle complet → curseur remis à NULL (le prochain run ré-affirme depuis la tête).
        expect(cursorUpd.payload.last_feed_cursor).toBeNull();
    });

    it("flag ON, curseur de départ non-null → REPREND au-delà (ne re-pousse pas la tête)", async () => {
        process.env.FEED_RESUME_CURSOR = "1";
        // Départ après p00002 → seuls p00003, p00004 restent à pousser (la tête n'est PAS re-lue).
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111", last_feed_cursor: "p00002" }];
        h.catalogSize = 5;
        h.msPerPush = 0;

        const json = await callCron();

        // 2 push seulement (p00003, p00004) — la tête déjà couverte n'est pas re-poussée.
        expect(h.googleFetchCount).toBe(2);
        expect(json.products_pushed).toBe(2);
        // La 1re page a démarré au keyset "p00002" (reprise, pas depuis le début).
        expect(h.pageCursors[0]).toBe("p00002");
        const cursorUpd = h.updates.find((u) => u.id === "m-1" && "last_feed_cursor" in u.payload)!;
        // Reste du catalogue poussé sans interruption → cycle bouclé → curseur remis à NULL.
        expect(cursorUpd.payload.last_feed_cursor).toBeNull();
    });

    it("flag ON, interruption → curseur = dernier produit traité (persisté pour le prochain run)", async () => {
        process.env.FEED_RESUME_CURSOR = "1";
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111", last_feed_cursor: null }];
        h.catalogSize = 5;
        h.msPerPush = 100_000; // interrompt après 3 push (comme la suite budget)

        const json = await callCron();

        expect(h.googleFetchCount).toBe(3);
        expect(json.time_budget_exhausted).toBe(true);
        const statusUpd = h.updates.find((u) => u.id === "m-1" && "last_feed_status" in u.payload)!;
        expect(statusUpd.payload.last_feed_status).toBe("partial");
        const cursorUpd = h.updates.find((u) => u.id === "m-1" && "last_feed_cursor" in u.payload)!;
        // 3 poussés = p00000..p00002 → curseur = p00002 (dernier traité) pour reprendre après.
        expect(cursorUpd.payload.last_feed_cursor).toBe("p00002");
    });

    it("flag ON, blip de lecture mi-stream → curseur = poussés AVANT l'échec (progression préservée)", async () => {
        // Une erreur DB sur la 2e page (après p00999) LÈVE (streamRows fail-loud) APRÈS que la
        // page 0 (1000 produits) a été poussée. Statut "error", MAIS le curseur mémorise p00999 →
        // le prochain run reprend après, sans re-pousser les 1000 déjà publiés (blip ≠ perte).
        process.env.FEED_RESUME_CURSOR = "1";
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111", last_feed_cursor: null }];
        h.catalogSize = 2500;
        h.msPerPush = 0;
        h.errorAtCursor = "p00999";

        await callCron();

        expect(h.googleFetchCount).toBe(1000);
        const statusUpd = h.updates.find((u) => u.id === "m-1" && "last_feed_status" in u.payload)!;
        expect(statusUpd.payload.last_feed_status).toBe("error");
        const cursorUpd = h.updates.find((u) => u.id === "m-1" && "last_feed_cursor" in u.payload)!;
        expect(cursorUpd.payload.last_feed_cursor).toBe("p00999"); // reprise après les 1000 poussés
    });

    it("flag ON, DEUX runs → la QUEUE est atteinte (famine cassée : tout le catalogue publié)", async () => {
        // LE test north-star : un catalogue trop gros pour un run est ENTIÈREMENT publié sur
        // plusieurs runs grâce au curseur — la tête n'est plus re-poussée en boucle, la queue avance.
        process.env.FEED_RESUME_CURSOR = "1";
        h.connections = [{ merchant_id: "m-1", store_code: "twostep-aaaa1111", last_feed_cursor: null }];
        h.catalogSize = 5;
        h.msPerPush = 100_000;

        // Run 1 : pousse p00000..p00002, interrompu, persiste le curseur dans h.connections.
        await callCron();
        expect(h.googleFetchCount).toBe(3);
        expect(h.connections[0].last_feed_cursor).toBe("p00002");

        // Reset des compteurs/horloge, mais on GARDE h.connections (curseur persisté = état DB).
        h.googleFetchCount = 0;
        h.updates = [];
        h.pageCursors = [];
        virtualNow = 1_000_000;

        // Run 2 : REPREND à p00002 → pousse p00003, p00004 (la QUEUE), termine le cycle.
        await callCron();
        expect(h.pageCursors[0]).toBe("p00002"); // a bien repris, pas recommencé à zéro
        expect(h.googleFetchCount).toBe(2); // seulement la queue, jamais re-pousser la tête
        // Cycle bouclé → curseur remis à NULL (ré-affirmation au prochain cycle).
        expect(h.connections[0].last_feed_cursor).toBeNull();

        // Invariant famine cassée : run 1 a poussé la tête (p00000..p00002 = 3), run 2 la queue
        // (p00003, p00004 = 2) → 5 produits distincts = catalogue entier atteint sur 2 runs
        // (SANS reprise, run 2 aurait re-poussé p00000..p00002 et jamais atteint la queue).
        expect(3 + 2).toBe(h.catalogSize);
    });
});

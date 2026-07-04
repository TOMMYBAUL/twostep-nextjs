import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Limite `max-rows` de PostgREST. Supabase la fixe par défaut à **1000** : un
 * SELECT non borné renvoie SILENCIEUSEMENT au plus 1000 lignes, **sans erreur**.
 *
 * Sur un gros catalogue (>1000 produits — un marchand multimarque type Deerskin
 * en a des milliers), une lecture non paginée TRONQUE donc le résultat sans la
 * moindre alerte → perte silencieuse n°1 :
 *  - index produits existants partiel → produits hors des 1000 premiers vus comme
 *    « nouveaux » → **doublons catalogue** (aucune contrainte UNIQUE sur ean) ;
 *  - lecture du stock en cours partielle → produits vendus hors des 1000 premiers
 *    **jamais remis à 0** par la réconciliation → faux « en stock ».
 *
 * north-star : « capter le stock sans rien OUBLIER, jamais [] masqué ».
 */
export const SUPABASE_MAX_ROWS = 1000;

/**
 * Borne de sécurité par défaut sur le NOMBRE DE PAGES lues. La boucle keyset ne
 * termine que si la colonne-curseur est STRICTEMENT croissante d'une page à l'autre ;
 * une colonne mal choisie (non unique, valeur répétée) ferait boucler la MÊME page à
 * l'infini — sur un cron Vercel, ça finit en kill à `maxDuration` sans diagnostic.
 * 200 pages × pageSize 1000 = 200 000 lignes : ~4× l'échelle cible pilote (50k SKU),
 * donc aucune lecture légitime actuelle ne l'approche. Fail-loud (throw) au-delà,
 * même esprit que `fetchProcessedProducts` (product-status.ts) : une lecture qui
 * dépasse la borne est soit une boucle, soit un volume qui exige un `maxPages`
 * EXPLICITE de l'appelant — jamais une troncature silencieuse.
 */
export const DEFAULT_MAX_PAGES = 200;

/**
 * Options de pagination KEYSET.
 *  - `pageSize` : taille de page (défaut = limite PostgREST). >= 1.
 *  - `column`   : colonne-curseur, **UNIQUE et totalement ordonnée**, par laquelle
 *    la factory `.order(column, {ascending:true})`. Défaut `"id"` (clé primaire).
 *    Cas particulier : la réconciliation lit `stock` ordonné par `product_id`.
 *  - `maxPages` : borne de sécurité anti-boucle (défaut `DEFAULT_MAX_PAGES` = 200).
 *    Dépassée → THROW (jamais un résultat partiel). Une lecture légitimement plus
 *    volumineuse (≥ maxPages × pageSize lignes) doit la relever EXPLICITEMENT.
 */
export interface KeysetOptions {
    pageSize?: number;
    column?: string;
    maxPages?: number;
}

/** Message d'erreur commun au dépassement de `maxPages` (fetchAllRows/streamRows). */
function maxPagesError(where: string, maxPages: number, pageSize: number, column: string, cursor: string | number | null): Error {
    return new Error(
        `${where}: limite de ${maxPages} pages atteinte (curseur "${column}"=${String(cursor)}) — ` +
            `boucle de pagination probable (colonne-curseur non strictement croissante ?) ; ` +
            `si la lecture est légitimement ≥ ${maxPages * pageSize} lignes, passer options.maxPages explicitement`,
    );
}

/**
 * Forme minimale d'une requête Supabase paginable par KEYSET : on chaîne
 * `.gt(column, cursor)` (borne basse EXCLUSIVE) puis `.limit(n)` qui résout le
 * contrat standard `{ data, error }`. `.gt` renvoie le builder (chaînable) et
 * `.limit` un thenable — comme le `PostgrestFilterBuilder` réel après `.order()`.
 */
interface KeysetQuery<T> {
    gt(column: string, value: string | number): KeysetQuery<T>;
    limit(
        count: number,
    ): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
}

/**
 * Construit l'erreur synthétique « data=null sans erreur » (anomalie SDK/transport :
 * un SELECT liste renvoie `[]` sur 0 ligne, jamais `null`). La rendre « erreur »
 * force les appelants à ne JAMAIS prendre un index vide (1re page → doublons) ni un
 * set partiel (page ultérieure → vendus jamais remis à 0) pour une lecture complète.
 */
function nullDataError(where: string): PostgrestError {
    return {
        message: `data=null sans erreur ${where} (anomalie SDK/transport) — lecture refusée pour ne pas masquer une troncature`,
        details: "",
        hint: "",
        code: "PGRST_NULL_DATA",
        name: "PostgrestError",
    } as PostgrestError;
}

/**
 * Extrait la valeur du curseur (dernière ligne d'une page pleine) pour la page
 * suivante. `null`/`undefined` = anomalie (la colonne-curseur doit être NOT NULL et
 * présente dans le SELECT) : on ne peut pas continuer une pagination keyset sans
 * borne fiable → l'appelant DOIT échouer fort plutôt que boucler ou tronquer.
 */
function nextCursor<T>(lastRow: T, column: string): string | number | null {
    const value = (lastRow as Record<string, unknown>)[column];
    if (typeof value === "string" || typeof value === "number") return value;
    return null;
}

/**
 * Lit TOUTES les lignes d'une requête Supabase en paginant par **KEYSET**
 * (`WHERE column > dernier_curseur ORDER BY column LIMIT pageSize`), pour
 * contourner la troncature silencieuse `max-rows`.
 *
 * **Pourquoi keyset et pas OFFSET (`.range()`)** : la pagination OFFSET n'est PAS
 * immunisée à l'écriture concurrente. Si une ligne est INSÉRÉE ou SUPPRIMÉE avant
 * l'offset courant pendant le balayage (lectures étalées dans le temps, marchand
 * SANS `sync_lock` comme `/api/catalog/import`), toutes les lignes suivantes se
 * DÉCALENT d'un cran → une ligne tombe dans le trou entre deux pages (SAUTÉE) ou
 * est lue deux fois (DOUBLON). Le curseur keyset est une VALEUR ancrée sur une
 * colonne stable, pas une position → un insert/delete ailleurs ne le décale pas.
 * → dérive-immune, de façon COHÉRENTE sur toutes les lectures produits.
 *
 * @param makeQuery factory qui renvoie une requête **fraîche** (mêmes colonnes /
 *   filtres) **ordonnée par `options.column` ascendant** à chaque appel. Le helper
 *   y applique `.gt(column, cursor)` (pages > 1) puis `.limit(pageSize)`.
 *
 * Contrat de retour **identique** à un SELECT Supabase (`{ data, error }`) :
 *  - 1re erreur → on s'arrête et on la propage (jamais de résultat partiel masqué) ;
 *  - `data` null sans erreur → traité comme une ERREUR (fail-loud) ;
 *  - curseur `null`/absent sur une page pleine → ERREUR (fail-loud : pagination
 *    keyset impossible sans borne, on refuse de tronquer ou boucler).
 */
export async function fetchAllRows<T>(
    makeQuery: () => KeysetQuery<T>,
    options: KeysetOptions = {},
): Promise<{ data: T[] | null; error: PostgrestError | null }> {
    const { pageSize = SUPABASE_MAX_ROWS, column = "id", maxPages = DEFAULT_MAX_PAGES } = options;
    if (pageSize < 1) {
        throw new Error(`fetchAllRows: pageSize doit être >= 1 (reçu ${pageSize})`);
    }
    if (maxPages < 1) {
        throw new Error(`fetchAllRows: maxPages doit être >= 1 (reçu ${maxPages})`);
    }

    const all: T[] = [];
    let cursor: string | number | null = null;
    let pages = 0;

    for (;;) {
        // Borne anti-boucle : un curseur qui ne CROÎT pas strictement (colonne non
        // unique / répétée) relirait la même fenêtre pour toujours. THROW, jamais
        // un résultat partiel présenté comme complet (cf. DEFAULT_MAX_PAGES).
        if (pages >= maxPages) {
            throw maxPagesError("fetchAllRows", maxPages, pageSize, column, cursor);
        }
        pages++;
        let query = makeQuery();
        if (cursor !== null) query = query.gt(column, cursor);
        const { data, error } = await query.limit(pageSize);

        // Une erreur sur n'importe quelle page arrête tout et remonte : on ne masque
        // JAMAIS une lecture incomplète derrière un succès partiel.
        if (error) {
            return { data: null, error };
        }
        if (data == null) {
            return { data: null, error: nullDataError(`après le curseur ${cursor}`) };
        }

        all.push(...data);

        // Page incomplète = dernière page. Une page pleine peut être suivie d'une page
        // vide (catalogue multiple exact de pageSize) → on refait un tour pour le voir.
        if (data.length < pageSize) {
            break;
        }

        const next = nextCursor(data[data.length - 1], column);
        if (next === null) {
            return {
                data: null,
                error: nullDataError(
                    `— curseur "${column}" absent/null sur une page pleine`,
                ),
            };
        }
        cursor = next;
    }

    return { data: all, error: null };
}

/**
 * Variante STREAMING de `fetchAllRows` : émet (`yield`) chaque page lazily au lieu de
 * tout matérialiser. Mémoire bornée à UNE page — pour les SORTIES volumineuses (feed
 * XML Google LFP d'un pilote multimarque = des milliers de SKU, cible 50k) où garder
 * tout le résultat ET la chaîne de sortie en RAM est inutile. Même pagination KEYSET
 * dérive-immune que `fetchAllRows` (cf. son doc).
 *
 * **Contrat fail-loud par THROW** (pas `{data,error}`, contrairement à `fetchAllRows`) :
 * un consommateur en streaming a déjà commencé à émettre des octets → il ne peut plus
 * changer le statut HTTP. Il DOIT donc AVORTER le flux (`controller.error`) sur une
 * lecture incomplète, jamais émettre une sortie partielle passée pour complète. On
 * lève donc :
 *  - une erreur de lecture à n'importe quelle page (`error`) ;
 *  - `data` null sans erreur à n'importe quelle page (anomalie SDK) ;
 *  - curseur `null`/absent sur une page pleine (pagination keyset impossible).
 * L'erreur portée par `.cause` préserve le diagnostic PostgREST. (north-star : « jamais
 * tronqué en silence » — un feed Google partiel crawlé = perte silencieuse n°1.)
 *
 * La factory doit `.order(options.column, {ascending:true})`, comme `fetchAllRows`.
 */
export async function* streamRows<T>(
    makeQuery: () => KeysetQuery<T>,
    options: KeysetOptions = {},
): AsyncGenerator<T[]> {
    const { pageSize = SUPABASE_MAX_ROWS, column = "id", maxPages = DEFAULT_MAX_PAGES } = options;
    if (pageSize < 1) {
        throw new Error(`streamRows: pageSize doit être >= 1 (reçu ${pageSize})`);
    }
    if (maxPages < 1) {
        throw new Error(`streamRows: maxPages doit être >= 1 (reçu ${maxPages})`);
    }

    let cursor: string | number | null = null;
    let pages = 0;

    for (;;) {
        // Borne anti-boucle (cf. fetchAllRows) : le consommateur streaming AVORTE
        // (contrat fail-loud par THROW), jamais un flux qui tourne sans fin.
        if (pages >= maxPages) {
            throw maxPagesError("streamRows", maxPages, pageSize, column, cursor);
        }
        pages++;
        let query = makeQuery();
        if (cursor !== null) query = query.gt(column, cursor);
        const { data, error } = await query.limit(pageSize);

        if (error) {
            throw new Error(
                `streamRows: lecture échouée après le curseur ${cursor}: ${error.message}`,
                { cause: error },
            );
        }
        if (data == null) {
            throw new Error(
                `streamRows: data=null sans erreur après le curseur ${cursor} (anomalie SDK/transport) — flux refusé pour ne pas masquer une troncature`,
            );
        }

        yield data;

        // Page incomplète = dernière page (cf. fetchAllRows). Une page pleine peut être
        // suivie d'une page vide (catalogue multiple exact de pageSize) → on refait un tour.
        if (data.length < pageSize) {
            break;
        }

        const next = nextCursor(data[data.length - 1], column);
        if (next === null) {
            throw new Error(
                `streamRows: curseur "${column}" absent/null sur une page pleine — pagination keyset impossible (colonne non lue ou NULL)`,
            );
        }
        cursor = next;
    }
}

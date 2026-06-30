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
 * Forme minimale d'une requête Supabase paginable : on n'a besoin que de `.range()`,
 * qui renvoie un thenable résolvant le contrat standard `{ data, error }`.
 */
interface RangeableQuery<T> {
    range(
        from: number,
        to: number,
    ): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
}

/**
 * Lit TOUTES les lignes d'une requête Supabase en paginant via `.range()`, pour
 * contourner la troncature silencieuse `max-rows`.
 *
 * @param makeQuery factory qui renvoie une requête **fraîche** (mêmes colonnes /
 *   filtres) à chaque appel — on lui applique `.range(from, to)`. L'appelant doit
 *   garantir un ordre de balayage stable pendant la pagination : soit via un
 *   `.order(...)` dans la factory, soit (cas ingestion) via le `sync_lock` qui
 *   interdit toute écriture concurrente sur le marchand pendant la lecture.
 * @param pageSize taille de page (défaut = la limite PostgREST). >= 1.
 *
 * Contrat de retour **identique** à un SELECT Supabase (`{ data, error }`) pour
 * rester un remplacement transparent :
 *  - 1re erreur → on s'arrête et on la propage (jamais de résultat partiel masqué) ;
 *  - `data` null sans erreur À N'IMPORTE QUELLE page (état SDK/transport inattendu —
 *    un SELECT liste renvoie `[]` sur 0 ligne, jamais null) → traité comme une ERREUR
 *    (fail-loud). Sinon, à la 1re page ça donnerait un index vide (→ doublons) et à une
 *    page ultérieure un résultat PARTIEL passé pour complet (→ vendus jamais remis à 0).
 *    Les deux appelants gèrent déjà `error` (lève / captureError+skip) → comportement
 *    uniforme, jamais de troncature masquée. (north-star : « jamais [] masqué ».)
 */
export async function fetchAllRows<T>(
    makeQuery: () => RangeableQuery<T>,
    pageSize: number = SUPABASE_MAX_ROWS,
): Promise<{ data: T[] | null; error: PostgrestError | null }> {
    if (pageSize < 1) {
        throw new Error(`fetchAllRows: pageSize doit être >= 1 (reçu ${pageSize})`);
    }

    const all: T[] = [];
    let from = 0;

    for (;;) {
        const { data, error } = await makeQuery().range(from, from + pageSize - 1);

        // Une erreur sur n'importe quelle page arrête tout et remonte : on ne masque
        // JAMAIS une lecture incomplète derrière un succès partiel.
        if (error) {
            return { data: null, error };
        }

        // null sans erreur = anomalie SDK/transport. On REFUSE de la masquer : la rendre
        // « erreur » force les appelants (lève / captureError+skip) à ne JAMAIS prendre
        // un index vide (1re page) ou un set partiel (page ultérieure) pour une lecture
        // complète. Un SELECT liste renvoie [] sur 0 ligne — null ne doit jamais arriver.
        if (data == null) {
            return {
                data: null,
                error: {
                    message: `fetchAllRows: data=null sans erreur à l'offset ${from} (anomalie SDK/transport) — lecture refusée pour ne pas masquer une troncature`,
                    details: "",
                    hint: "",
                    code: "PGRST_NULL_DATA",
                    name: "PostgrestError",
                } as PostgrestError,
            };
        }

        all.push(...data);

        // Page incomplète = dernière page. Une page pleine peut être suivie d'une page
        // vide (catalogue multiple exact de pageSize) → on refait un tour pour le voir.
        if (data.length < pageSize) {
            break;
        }
        from += pageSize;
    }

    return { data: all, error: null };
}

/**
 * Variante STREAMING de `fetchAllRows` : émet (`yield`) chaque page lazily au lieu de
 * tout matérialiser. Mémoire bornée à UNE page — pour les SORTIES volumineuses (feed
 * XML Google LFP d'un pilote multimarque = des milliers de SKU, cible 50k) où garder
 * tout le résultat ET la chaîne de sortie en RAM est inutile.
 *
 * **Contrat fail-loud par THROW** (pas `{data,error}`, contrairement à `fetchAllRows`) :
 * un consommateur en streaming a déjà commencé à émettre des octets → il ne peut plus
 * changer le statut HTTP. Il DOIT donc AVORTER le flux (`controller.error`) sur une
 * lecture incomplète, jamais émettre une sortie partielle passée pour complète. On
 * lève donc :
 *  - une erreur de lecture à n'importe quelle page (`error`) ;
 *  - `data` null sans erreur à n'importe quelle page (anomalie SDK : un SELECT liste
 *    renvoie `[]` sur 0 ligne, jamais null) → troncature potentielle masquée.
 * L'erreur portée par `.cause` préserve le diagnostic PostgREST. (north-star : « jamais
 * tronqué en silence » — un feed Google partiel crawlé = perte silencieuse n°1.)
 *
 * Ordre de balayage stable obligatoire (`.order(...)` dans la factory), comme `fetchAllRows`.
 */
export async function* streamRows<T>(
    makeQuery: () => RangeableQuery<T>,
    pageSize: number = SUPABASE_MAX_ROWS,
): AsyncGenerator<T[]> {
    if (pageSize < 1) {
        throw new Error(`streamRows: pageSize doit être >= 1 (reçu ${pageSize})`);
    }

    let from = 0;

    for (;;) {
        const { data, error } = await makeQuery().range(from, from + pageSize - 1);

        if (error) {
            throw new Error(
                `streamRows: lecture échouée à l'offset ${from}: ${error.message}`,
                { cause: error },
            );
        }

        if (data == null) {
            throw new Error(
                `streamRows: data=null sans erreur à l'offset ${from} (anomalie SDK/transport) — flux refusé pour ne pas masquer une troncature`,
            );
        }

        yield data;

        // Page incomplète = dernière page (cf. fetchAllRows). Une page pleine peut être
        // suivie d'une page vide (catalogue multiple exact de pageSize) → on refait un tour.
        if (data.length < pageSize) {
            break;
        }
        from += pageSize;
    }
}

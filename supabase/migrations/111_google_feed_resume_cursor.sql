-- 111_google_feed_resume_cursor.sql  (NON APPLIQUÉE — GATED, escaladée à Thomas)
--
-- A5 (audit d'optimisation 2026-07-04, Cluster A « fiabilité du chemin de publication ») —
-- CHECKPOINT / REPRISE du push feed Google LFP (Voie A, cron `google-feed`).
--
-- POURQUOI : le cron pousse les produits éligibles d'un marchand UN PAR UN, borné par un
-- budget temps (270 s) sous `maxDuration=300`. Sur un catalogue dont le push COMPLET dépasse
-- ce budget (pilote multimarque type Deerskin = des milliers de SKU), la fonction s'arrête
-- proprement (statut "partial") — MAIS, sans point de reprise, le run SUIVANT redémarre à
-- `id=0` : il re-pousse ÉTERNELLEMENT la même TÊTE du catalogue et n'atteint JAMAIS la QUEUE.
-- = famine silencieuse : des produits vendables ne sont JAMAIS publiés sur Google (perte n°1
-- du north-star « ne rien oublier »). Le code prétendait à tort « se termine au run suivant ».
--
-- CE QUE FAIT CETTE COLONNE : `last_feed_cursor` mémorise l'`id` du dernier produit traité au
-- run précédent. Le cron (flag `FEED_RESUME_CURSOR=1`) démarre le stream keyset AU-DELÀ de ce
-- curseur → la queue avance à chaque run. Quand un CYCLE complet est bouclé (plus de produit à
-- pousser, run non interrompu), le curseur est REMIS À NULL → le run suivant ré-affirme le feed
-- depuis la tête (garde le feed Google frais). NULL = début du catalogue = comportement actuel.
--
-- SÛRETÉ :
--   * Additive et IDEMPOTENTE (`ADD COLUMN IF NOT EXISTS`) — ne touche AUCUNE donnée existante,
--     ne DROP rien, pas de recréation de fonction/contrainte (0 risque ACL, 0 lock de table long).
--   * NULLABLE, sans DEFAULT → toutes les lignes existantes = NULL = « démarrer du début » =
--     exactement le comportement d'aujourd'hui. Le code est DÉPLOYABLE AVANT cette migration :
--     tant que `FEED_RESUME_CURSOR` ≠ '1', la colonne n'est jamais lue ni écrite (le SELECT ne
--     la référence même pas) → aucune régression possible pré-migration.
--   * `uuid` : les `id` produits SONT des uuid → même type = Postgres REJETTE une valeur
--     malformée à l'écriture (impossible d'empoisonner la colonne avec une chaîne invalide qui
--     ferait ensuite échouer `.gt("id", curseur)` en boucle — finding database-reviewer). L'ordre
--     de comparaison uuid = l'ordre de sa forme hexadécimale canonique → keyset cohérent avec
--     `.order("id")` + `.gt("id", curseur)` de `streamRows`. Nullable, pas de FK (curseur transient,
--     un produit supprimé rend juste le curseur « périmé » → au pire on reprend un cran trop tôt).
--
-- ROLLBACK :
--   ALTER TABLE google_merchant_connections DROP COLUMN IF EXISTS last_feed_cursor;
--   (+ retirer le flag FEED_RESUME_CURSOR de l'env). Réversible sans perte : la colonne ne
--   porte qu'un curseur de progression transient, jamais de donnée métier.

BEGIN;

ALTER TABLE google_merchant_connections
    ADD COLUMN IF NOT EXISTS last_feed_cursor uuid;

COMMENT ON COLUMN google_merchant_connections.last_feed_cursor IS
    'A5 — checkpoint/reprise du push feed Google (Voie A). id du dernier produit poussé au '
    'run precedent : le cron reprend au-dela (FEED_RESUME_CURSOR=1). NULL = repartir de la tete '
    '(cycle complet boucle → re-affirmation du feed). Curseur transient, aucune donnee metier.';

COMMIT;

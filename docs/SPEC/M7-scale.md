# Maillon M7 — Scale / volume

> Les 8 maillons sont prouvés sur de PETITES fixtures. M7 garantit qu'ils tiennent sur un
> catalogue pilote réel (Deerskin = milliers de SKU) **sans troncature silencieuse** — la
> perte n°1 qui est invisible sur 10 produits et mord à 10 000.

## Rôle
Borner mémoire et débit réseau pour éviter la troncature silencieuse sur catalogues > 1000,
via 3 mécanismes : **pagination** PostgREST (max-rows 1000), **budget temps** Vercel (270 s
utiles sur 300 s max), **batching** d'écritures (500 items/flush).

## Contrat I/O
- `fetchAllRows(makeQuery, pageSize=1000)` → `{data: T[]|null, error}` — pagine `.range()` jusqu'à
  page < pageSize, ordre déterministe `.order("id")`.
- `streamRows(makeQuery, pageSize=1000)` → `AsyncGenerator<T[]>` — pagination LAZY, mémoire = 1 page.
- `processWithinTimeBudget(items, action, {now, deadlineMs})` → `{succeeded, attempted, interrupted}`.
- `ingestStockSnapshot(...)` → flush batché (voir M4).

## Invariants nord (TESTÉS — pas des intentions)

1. **Max-rows PostgREST jamais silencieux.** Les 4 sorties Google + les 2 lectures d'ingestion
   enveloppent leur SELECT dans `fetchAllRows` (`supabase/paginate.ts`). Un catalogue de 1500 →
   2 pages [0..999]+[1000..1999], 0 produit omis. *→ `tests/google-feed-output-pagination.test.ts`,
   `tests/ingest-snapshot-pagination.test.ts`.*
2. **Pas de doublons via index partiel.** L'index produits d'ingestion est lu COMPLET avant le match
   (sinon les produits > 1000 sont recréés). *→ `ingest-snapshot-pagination.test.ts` (1500 existants,
   push 1499 → `products_created=0`).*
3. **Réconciliation ne perd pas les vendus > 1000.** Le stock en cours est lu paginé → un produit
   #1200 absent du push est bien remis à 0 (sinon « en stock » faux = faux positif n°1).
4. **Feed jamais partiel silencieux (streaming).** `streamRows` THROW → `controller.error()` avorte le
   HTTP (Google re-crawle) au lieu d'un 200 tronqué. *→ `tests/feed-lfp-stream.test.ts` (page 2 KO →
   `.text()` rejette).*
5. **Mémoire bornée à 1 page.** Voie B émet head → items page par page → tail, jamais de matérialisation
   complète (50k SKU ≈ 1 page RAM vs le catalogue entier ×3).
6. **Statut HONNÊTE si interrompu.** Budget temps épuisé → `interrupted=true` → statut « partial »
   (jamais « success ») + détail X/Y poussés, Z non tentés. `feed-push.ts:processWithinTimeBudget` +
   `maxDuration=300`. *→ `tests/google-feed-time-budget.test.ts`.*
7. **Batching borne les aller-retours.** Ingestion accumule et flush par 500 (créations ET updates
   groupés par forme de colonnes pour ne pas nuller une colonne absente). *→ `tests/ingest-snapshot-batching.test.ts`.*

## Modes d'échec attendus

| Échec | Comportement EXIGÉ | Où |
|---|---|---|
| `fetchAllRows` — erreur une page | stop, `{null, error}` (**fail-loud closed**) | `paginate.ts` ~67 |
| `fetchAllRows` — `data=null` sans error (anomalie SDK) | traité comme ERREUR (refuse de masquer une lecture partielle) | `paginate.ts` ~75 |
| `streamRows` — erreur / `data=null` | **THROW** (impossible de changer le status HTTP mid-stream) | `paginate.ts` ~133 |
| `processWithinTimeBudget` — deadline atteinte | `interrupted=true`, sortie propre (pas de kill Vercel brutal) | `feed-push.ts` ~55 |
| Ingestion — lecture index KO | **THROW** (pas de corruption/doublon silencieux) | `snapshot.ts` ~136 |

## Preuves exigées
- **Unit (fait)** : voir tests. Pagination, streaming, budget temps, batching — tous prouvés sur
  fixtures de 1500-2500 items avec faux clients qui plafonnent/comptent.
- **PREUVE RÉELLE — MANQUANTE** : ingest + feed + réconciliation sur un catalogue synthétique
  **10k→50k**, mesure du temps ET de la mémoire, **0 perte / 0 timeout**. Les tests prouvent la logique
  de pagination, pas le comportement réel sous charge Vercel. À faire (peut être synthétique, sans marchand réel).

## Statut réel + dette connue
- **done + testé** : pagination (ingest + 4 sorties Google), streaming Voie B, budget temps cron, batching ingest.
- **RESTE (prochain [R])** : **chunker/streamer la boucle produits du cron `google-feed` via `streamRows`**
  pour finir un catalogue > budget en UN run — aujourd'hui `processWithinTimeBudget` coupe proprement
  mais la queue tail n'est publiée qu'au run suivant.
- **dette** :
  - Flush ingestion **pas parallèle** (500 séquentiel) → `Promise.all` de 3-4 upserts possible.
  - `SUPABASE_MAX_ROWS=1000` **codé en dur** → source unique dynamique.
  - `streamRows` **sans limite de pages** (anti-boucle-infinie si `.order()` change entre pages) →
    ajouter `MAX_PAGES` (cf. `product-status.ts`).
  - Preuve de charge réelle 50k jamais exécutée (voir Preuves exigées).

## Périmètre Fable 5
- **AUDITER** : réfuter « 0 perte à l'échelle » — trouver une lecture DB non paginée sur un chemin
  critique, ou un feed qui pourrait renvoyer 200 tronqué. Vérifier que le batching update ne nulle
  jamais une colonne absente du corps (piège upsert PostgREST).
- **CONSTRUIRE** : (1) **chunker le cron `google-feed` via `streamRows`** (le [R] ouvert) ; (2) la
  **preuve de charge 10k→50k** (synthétique) ; (3) dettes (flush parallèle, max-rows dynamique, MAX_PAGES).
  Barre de preuve = test à l'échelle + mesure temps/mémoire.

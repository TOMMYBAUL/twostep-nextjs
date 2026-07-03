# Maillon M4 — Stockage atomique + réconciliation snapshot

> Le point d'écriture unique de la vérité stock. Nord : **atomicité** (pas de course
> qui double un décrément) + **réconciliation honnête** (le disparu passe à 0, jamais un
> fichier partiel qui vide la boutique en silence).

## Rôle
Écrire la quantité de stock de façon **atomique** avec traçabilité de source, et
**réconcilier** un snapshot : les produits absents du push passent à `quantity=0`, sous
garde anti-push-partiel.

## Contrat I/O
- **Entrée** : `updateStockAtomic(productId, quantity, mode: absolute|delta, source, sourceTs)` ;
  `ingestStockSnapshot(merchantId, items[], admin, {reconcile, dryRun, coverage})`.
- **Sortie garantie** : `stock.quantity` écrite atomiquement, `stock.source` + `stock.source_ts`
  tracés (migration 104) ; produits absents → `quantity=0, source="file_push"` ; `feed_events.out_of_stock`
  émis ; `SnapshotResult{stock_replaced, stock_zeroed, reconcile_skipped, errors[]}`.

## Invariants nord (TESTÉS — pas des intentions)

1. **Atomicité stock.** RPC Postgres `update_stock_atomic` (`migrations/104…`) : `FOR UPDATE` lock,
   transaction, `GREATEST(0, …)` (jamais de négatif). → race TOCTOU éliminée.
2. **Garde anti-régression temporelle.** `p_source_ts < v_prev_ts` → ne PAS écrire (une source plus
   ancienne, ex. webhook retardé, n'écrase pas une observation plus fraîche). *migration 104.*
3. **Réconciliation idempotente.** `selectProductsToZero` (`ingest/reconcile.ts`) — même snapshot
   rejoué = même résultat. *→ `tests/ingest-maillon4-reconcile.test.ts`, `tests/ingest-reconcile.test.ts`.*
4. **Jamais un fichier partiel qui vide la boutique.** Garde `minCoverageRatio = 0.5` : couverture
   < 50 % sur catalogue > 10 produits → **skip réconciliation + erreur visible** ; `accepted.length===0`
   → réconciliation annulée (« aucune ligne exploitable »). `reconcile.ts` + `snapshot.ts`.
5. **Zéro dégradé = honnête.** Passage à `quantity=0` → `available_sizes=[]` vidé (sinon la fiche
   affiche des pointures périmées). `snapshot.ts` ~496.
6. **Source explicite, jamais de DEFAULT.** Chaque écriture déclare son `source` parmi
   `webhook|pos_sync|file_push|scan|invoice|cloture|manual`.

## Modes d'échec attendus

| Échec | Comportement EXIGÉ | Où |
|---|---|---|
| `source_ts` plus ancien que l'existant | **skip écriture** (anti-régression) | RPC `update_stock_atomic` |
| Lecture stock en cours (réconciliation) KO | **fail-loud** : `reconcile_skipped=true` + erreur, stock préservé | `snapshot.ts` ~443 |
| Write stock=0 (réconciliation) KO | **fail-loud** + Sentry (`captureError`) — c'est LE write critique (vendu non masqué = faux positif n°1) | `snapshot.ts` ~471 |
| Collision slug / FK sur flush batch | **fail-loud** + repli mono-ligne (isole la faute, compteur reflète le réel) | `snapshot.ts` ~316-390 |
| Fichier 0 ligne exploitable | **réconciliation annulée** + erreur | `snapshot.ts` ~417 |
| Clear `available_sizes` KO | fail-closed non bloquant (stock=0 déjà écrit), erreur capturée | `snapshot.ts` ~500 |

## Preuves exigées
- **Unit (fait)** : voir tests. Le pur (`selectProductsToZero`, `chunk`, garde couverture) est
  entièrement testé ; la réconciliation e2e (produit absent→0, feed_events, sizes vidées) aussi.
- **PREUVE RÉELLE** : un 2e push réel qui RETIRE un produit → vérifier en DB que le produit disparu
  passe à `quantity=0` avec `source=file_push`, et qu'un `feed_events.out_of_stock` existe. Exige env
  live (Supabase) → run supervisé.

## Statut réel + dette connue
- **done + testé** : atomicité (migration 104 appliquée prod 2026-06-17), réconciliation gardée, batching.
- **dette** :
  - **Garde 50 % couverture peut bloquer un push légitime** (grosse boutique à forte rotation) →
    `minCoverageRatio` codé en dur, à paramétrer par historique. **À trancher.**
  - **Colonne quantité manquante** signalée post-facto (errors + Sentry) plutôt que rejetée en amont
    (décision « présence » sémantique) — idéal = wizard qui re-prompte.
  - **Pas de ledger append-only multi-source** : `stock` porte la source COURANTE seulement, pas
    l'historique. Un marchand webhook + file_push mélangés → seule la dernière source est tracée. Différé.
  - **Batch 500 = magic number** (borne URL PostgREST), pas de test de charge > 50k (couvert conceptuellement M7).

## Périmètre Fable 5
- **AUDITER** : réfuter « le disparu passe à 0 sans jamais vider par erreur » — trouver un push
  partiel/illisible qui zéroïse à tort, OU un produit vendu qui reste « en stock ». Vérifier que la
  garde anti-régression temporelle ne bloque pas une écriture légitime (dérive d'horloge POS →
  invariant M5 `source_ts ≤ updated_at`). Vérifier que le write stock=0 est TOUJOURS sous `captureError`.
- **CONSTRUIRE** : paramétrer `minCoverageRatio` (dette). Barre de preuve = régression + 2e push réel inspecté.

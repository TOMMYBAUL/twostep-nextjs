# Maillon M1 — Collecte (4 sources)

> Le maillon d'entrée. Nord absolu : **ne rien perdre en silence**. Une vente non
> décrémentée, un catalogue effacé par erreur, une colonne quantité perdue = faux positif
> qui fait fuir le marchand. Toutes les gardes ci-dessous existent pour rendre la perte
> **impossible sans alerte**.

## Rôle
Capter le stock de **n'importe quelle source** (caisse API, webhook temps réel, fichier
poussé, facture/scan) et le normaliser en écritures stock tracées, sans perte silencieuse.

## Contrat I/O
- **Entrées sales acceptées** : catalogue POS (Square/Shopify/Lightspeed/Zettle/Clictill/
  Fastmag) ; webhook HTTP signé (qté absolue ou delta selon vendor) ; fichier CSV/XLSX
  (encodages UTF-8/Windows-1252/UTF-16, `;`/`,`, en-têtes FR+EN) ; facture PDF/e-invoice.
- **Sortie garantie** : écritures `stock` avec `source` explicite + `source_ts` réel, via
  `updateStockAtomic` (M4) ; compteurs de résultat qui reflètent **le réel écrit**, pas une
  intention (`SyncResult` / `SnapshotResult`).

## Invariants nord (TESTÉS — pas des intentions)

### 1a. POS sync (pull) — `src/lib/pos/sync-engine.ts`
1. **Catalogue fantôme bloqué.** `computeOrphanProductIds` : catalogue POS courant VIDE →
   ne masque RIEN (erreur transitoire probable ≠ suppression réelle). *→ `tests/pos-sync-engine-writes.test.ts`.*
2. **Source explicite.** `buildPosStockRows` déclare `source="pos_sync"` + `source_ts` sur
   chaque ligne ; jamais de DEFAULT silencieux. *→ `tests/pos-sync-stock-rows.test.ts`.*
3. **Stock écrit ou 500.** `applyStockUpserts` LÈVE sur échec de lot (le compteur ne ment pas).
4. **Masquage orphelins non silencieux.** `hideOrphanProducts` LÈVE si échec ; jamais `.in("id",[])`.
5. **Produits créés invisibles + `pending_review`** jusqu'à score ≥ 0.95 (gate zéro faux positif).
6. **Nom seul JAMAIS matché en POS.** `allowFuzzy:false` (sync-engine ~ligne 230) : EAN/SKU only.

### 1b. Webhooks POS — `api/webhooks/{shopify,square,lightspeed,zettle}/route.ts`
7. **Idempotence non silencieuse.** Lecture idempotence échouée → **500** (POS retente), pas un
   skip muet qui doublerait un décrément. *→ `tests/webhook-routes-stock.test.ts`.*
8. **`source_ts` = heure réelle de l'événement** (pas de réception) → transmis à `updateStockAtomic`
   (garde anti-régression M4). *→ `tests/pos-webhook-parse.test.ts`.*
9. **Ambiguïté multi-tenant visible.** `resolveWebhookProduct` : `pos_item_id` partagé par >1
   marchand → `captureError` + `null` (vente non appliquée mais SIGNALÉE, jamais silencieuse).

### 1c. Push fichier (snapshot) — `src/lib/ingest/snapshot.ts` (flux le plus sensible)
10. **Colonne quantité manquante SIGNALÉE.** coverage.quantity=false + lignes acceptées → `errors`
    + Sentry ; jamais un « 1 de chaque » silencieux. *→ `tests/ingest-maillon2-triage.test.ts`.*
11. **Pagination complète.** `fetchAllRows` lit TOUT le catalogue pour le matching (troncature
    PostgREST 1000 → doublons au-delà). *→ `tests/ingest-snapshot-pagination.test.ts`.*
12. **Déduplication intra-push** (même EAN/SKU en 2 lignes = 1 produit) via `insertRowById`.
13. **Sémantique REPLACE** (`source="file_push"`), pas delta.
14. **Enrichissement async découplé** : nouveaux produits enfilés `enrichment_jobs`, invisibles
    tant que non scorés. (Réconciliation = M4.)

## Modes d'échec attendus

| Échec | Comportement EXIGÉ | Où |
|---|---|---|
| Token POS expiré + refresh KO | **fail-loud** (throw) | `sync-engine` ~175 |
| Catalogue POS vide (blip) | **skip masquage** (anti-fantôme) | `computeOrphanProductIds` |
| Idempotence webhook illisible | **500** (retente), jamais skip muet | `webhooks/*/route.ts` |
| `pos_item_id` ambigu | `captureError` + `null` (visible, non appliqué) | `resolveWebhookProduct` |
| Lecture index produits (fichier) KO | **fail-loud** (sinon 0 match → doublons) | `snapshot.ts` ~136 |
| Écriture métadonnée / enrich / image | fail-closed non bloquant, `captureError` jamais avalé | `sync-engine` |

## Preuves exigées
- **Unit (fait)** : voir tests cités. Couverture POS + webhooks + snapshot.
- **PREUVE RÉELLE** : un vrai export de caisse pilote (Deerskin) poussé → `SyncResult`/`SnapshotResult`
  inspecté (créés/màj/orphelins) + une vente réelle via webhook → décrément unique vérifié en DB.
  Exige **env live** (adapters + secrets POS) → run supervisé ou Routine upgradée.

## Statut réel + dette connue
- **done + testé** : POS pull, webhooks, snapshot. Scale traité en M7.
- **dette** :
  - `resolveWebhookProduct` renvoie `null` sur ambiguïté → événement perdu pour ce marchand
    (fix propre = scoper `pos_item_id` par `merchant_id`). **À trancher.**
  - Matching par **nom fuzzy** (Levenshtein) encore possible sur le chemin fichier (allowFuzzy
    non forcé à false partout) → risque de matcher un produit différent. À durcir.
  - Pas d'idempotence sur fichier entier (re-push identique = ré-ingestion) — OK sémantiquement
    (snapshot) mais pas de dedup.
  - Pas de retry explicite sur `adapter.getCatalog` (rate-limit/5xx) — laissé au catch + Sentry.
- **hors scope M1** : factures/scan (`parseInvoice`, `activateInvoice`) = ANCIENNE idée, **hors cap**
  (cf. autonomy-priorities OUT-OF-SCOPE) — ne PAS durcir.

## Périmètre Fable 5
- **AUDITER** : pour chaque source, réfuter « ne rien perdre » — trouver un chemin où une vente,
  un produit ou une quantité disparaît sans `errors`/Sentry/throw. Vérifier que TOUS les compteurs
  reflètent l'écrit réel (jamais l'intention). Vérifier que `allowFuzzy:false` est effectif sur le
  chemin fichier aussi (dette ci-dessus).
- **CONSTRUIRE** : trancher les 2 dettes (ambiguïté webhook → null ; fuzzy nom). Barre de preuve =
  test de régression + preuve réelle sur export pilote (env live).

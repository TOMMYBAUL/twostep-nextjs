# Maillon M6 — Sortie Google LFP

> Le débouché de valeur : « feed Google LFP as a service ». Nord : **parité stricte** entre
> les canaux et **honnêteté du feed** — un produit non éligible ne sort pas, une promo ne
> s'affiche que si elle est vraie, et un feed tronqué avorte plutôt que de mentir « complet ».

## Rôle
Émettre les produits éligibles d'un marchand vers Google Merchant Center via **deux canaux
complémentaires** : Voie A (cron Content/Merchant API, insert séquentiel) + Voie B (feed XML
public crawlé par Google, streamé), avec push d'inventaire temps réel et calcul de readiness.

## Contrat I/O
- **Entrée** : `google_merchant_connections` (Voie A) ; `merchantId` + params (Voie B) ; `ProductRow`
  (id, ean, price, photo_*, stock, promotions) → `GoogleProduct`.
- **Sortie garantie** : Voie A → `{merchants, merchants_attempted, products_pushed, errors,
  time_budget_exhausted}` + écrit `last_feed_status/error` ; Voie B → `text/xml` (RSS 2.0 `xmlns:g`)
  streamé, ou 404/410/500 ; readiness via `/api/google/stats` (`lfp_feed_ready`) et preview via
  `/api/google/feed-preview` (`would_publish`/`blocked`/`summary`).

## Invariants nord (TESTÉS — pas des intentions)

1. **Gate d'éligibilité UNIQUE.** `isFeedEligible` / `classifyFeedRow` (`google/feed-eligibility.ts`) :
   GTIN ≥ 8 chiffres ET prix > 0 ET (image OU tier GTIN-only). Les 3 sorties (`feed.ts:filterEligibleProducts`,
   `lfp-xml.ts:filterFeedEligible`, `feed-preview`) délèguent au MÊME gate → **jamais de divergence**.
   *→ `tests/lib/google/feed-preview.test.ts` (classifyFeedRow ⟺ isFeedEligible).*
2. **Population SQL identique sur les 4 sorties** : `visible=true AND review_status='validated' AND
   archived_at IS NULL AND variant_of IS NULL`. `cron/google-feed`, `feed/lfp`, `feed-preview`, `inventory`.
3. **Store_code canonique.** `resolveStoreCode` (`google/store-code.ts`) : persisté prime, défaut
   `twostep-{id8}` → évite le faux « 2 magasins fantômes » entre Voie A et Voie B.
4. **Promo honnête.** `salePrice` émis SEULEMENT si active ET `sale_price < base_price` ET dates valides
   (`activeFeedSalePrice`). Bug D1 fermé (0 promo remontait avant).
5. **Disponibilité = chaîne exacte** `"in stock"` / `"out of stock"` (ESPACE, pas underscore) —
   `"in_stock"` = rejet silencieux Google. `inventory.ts:buildLocalInventoryPayload`.
6. **Tier GTIN-only (D2) OFF par défaut** : `gtinOnlyTierEnabled()` (`GOOGLE_GTIN_ONLY_TIER`) — quand ON,
   image optionnelle mais EAN + prix toujours requis ; consulté par les 3 filtres.
7. **Statut produit asynchrone** : `product-status.ts` lit `/products` (leçon : 200 insert ≠ acceptation
   finale) → cron `google-status` → `quality_alerts(google_disapproved)`. *→ `tests/cron-google-status-route.test.ts`.*

(Pagination + streaming + budget temps = **invariants partagés avec M7**, voir `M7-scale.md`.)

## Modes d'échec attendus

| Échec | Comportement EXIGÉ | Où |
|---|---|---|
| Lecture `google_merchant_connections` KO | **fail-loud** 500 + Sentry, 0 marchand traité | `cron/google-feed` ~35 |
| Token Google expiré (refresh KO) | statut « error » écrit + Sentry (honnête) | `merchant.ts` ~107 + cron ~79 |
| Produits non lisibles (`error`/`data=null`) | **fail-loud** (ne continue jamais) | `cron` ~110 |
| Push 1 produit rejeté par Google | Sentry item-level, **continue** (pas de stop-on-one) | `cron` ~141 |
| Budget temps épuisé en plein marchand | statut « partial » + détail (X/Y, Z non tentés) + Sentry | `feed-push.ts` ~55 (voir M7) |
| Voie B — erreur 1re page | **500** (rien streamé encore) + Sentry | `feed/lfp` ~115 |
| Voie B — erreur page ultérieure | `controller.error()` **avorte** le HTTP (jamais 200 tronqué) | `feed/lfp` ~150 |

## Preuves exigées
- **Unit (fait)** : voir tests. Parité gate, promo, streaming, budget, statut produit.
- **PREUVE RÉELLE** : pousser un vrai marchand connecté → vérifier dans Merchant Center que les
  produits éligibles apparaissent, que les promos sont correctes, et corréler les rejets avec
  `quality_alerts`. Exige **env live** (compte Google + connexion OAuth) → le vrai blocage = 1 pilote
  live (cf. `google-lfp-etat`), pas le code.

## Statut réel + dette connue
- **done + testé** : Voie A cron, Voie B XML streamé, inventory push, readiness, preview, statut produit.
- **dette** :
  - **Cron `google-feed` NON chunké** (voir M7) : `processWithinTimeBudget` coupe proprement mais la
    queue tail n'est publiée qu'au run suivant. **C'est le prochain [R] scale.**
  - **Voie A vs B** : décrites « complémentaires » ; à décider si garder Voie B seule une fois stable
    (Content API deprecation ?).
  - Corrélation statut produit ↔ `quality_alerts` à surfacer dans l'UI marchand.

## Périmètre Fable 5
- **AUDITER** : réfuter la parité — trouver un produit qui sort par un canal mais pas l'autre (gate,
  population, store_code, transform divergents). Vérifier qu'aucune promo fausse ne sort et que la
  disponibilité utilise la chaîne exacte. Vérifier que Voie B avorte bien mid-stream (pas de 200 tronqué).
- **CONSTRUIRE** : le chunking du cron (partagé M7). Le reste (pilote live) = Thomas + env live.

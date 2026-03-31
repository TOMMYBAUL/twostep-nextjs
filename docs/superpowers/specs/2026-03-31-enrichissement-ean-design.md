# Phase A — Enrichissement EAN automatique

> **Statut** : Design validé par Thomas, prêt pour plan d'implémentation
> **Date** : 2026-03-31
> **Effort estimé** : 2-3 jours

## Contexte

Two-Step sync les catalogues marchands depuis leurs POS (Square, Shopify, Lightspeed, SumUp, Zettle). Les données POS sont souvent spartiates : noms approximatifs ("NB 574 gris 42"), pas de photo HD, pas de marque normalisée. Un module `lookupEan` existe déjà dans le code (`src/lib/ean/lookup.ts`) avec un cache DB (`ean_lookups`) et les colonnes `canonical_name` / `brand` sur `products`, mais il n'est jamais appelé dans le flux de sync.

L'intelligence compétitive (NearST, Leclerc, UPCitemdb) a révélé qu'un enrichissement automatique par EAN est quasi gratuit et transforme la qualité perçue du catalogue.

## Décisions de design

| Décision | Choix | Raison |
|---|---|---|
| Timing enrichissement | **Hybride : sync + cron** | Sync enrichit tout en synchrone (plan payant le permet), cron rattrape les échecs |
| Endpoint UPCitemdb | **Plan payant $10/mois** (1500 req/jour, 25/min) | Pas de blocage à l'onboarding, confort pour scaler |
| LLM fallback | **Reporté (Phase A.5)** | On mesure d'abord le taux de couverture EAN réel |
| Affichage nom | **canonical_name prioritaire** | Le consommateur voit "New Balance 574 Core Grey" pas "NB 574 gris 42" |

## Architecture

```
Sync POS (existant)
  └─ upsertProduct (existant)
       └─ [NOUVEAU] enrichNewProducts(merchantId)
            ├─ Check cache ean_lookups (existant en DB)
            ├─ UPCitemdb API (plan payant, header API key)
            ├─ OpenEAN fallback (existant, gratuit)
            ├─ Mise à jour produit (canonical_name, brand, photo_url, category)
            └─ Création image job si nouvelle photo (existant)

Cron /api/cron/enrich-ean (toutes les heures)
  └─ Rattrapage produits avec EAN non-enrichis (ean IS NOT NULL AND canonical_name IS NULL)
       └─ Même fonction enrichProduct() réutilisée
```

## Flux détaillé

### 1. Enrichissement dans le sync engine

Après la boucle d'upsert produits et avant le groupement de variantes dans `syncMerchantPOS` :

1. Récupérer tous les produits du marchand avec `ean IS NOT NULL AND canonical_name IS NULL`
2. Pour chaque produit :
   a. Vérifier le cache `ean_lookups` — si trouvé, appliquer directement (zéro appel réseau)
   b. Sinon, appeler UPCitemdb (plan payant) — si trouvé, cacher dans `ean_lookups` + appliquer
   c. Sinon, appeler OpenEAN (fallback gratuit) — si trouvé, cacher + appliquer
   d. Sinon, ne rien faire (le produit garde son nom POS)
3. Pour chaque produit enrichi avec une nouvelle photo : créer un `image_job` (pipeline rembg existant)

### 2. Rate limiting

- Rate limiter simple en mémoire : max 25 requêtes/minute vers UPCitemdb (limite du plan payant à $10/mois)
- Implémentation : token bucket ou compteur + `await sleep()` si on approche la limite
- Pas de rate limit pour OpenEAN (pas de limite documentée, fallback secondaire)
- En pratique, un marchand avec 300 produits à enrichir prendra ~12 minutes (300 / 25 par min) — acceptable pour un premier sync

### 3. Gestion d'erreur

- Timeout UPCitemdb : 5 secondes max, retry 1x
- HTTP 429 (rate limit) : skip le produit, le cron rattrapera
- Erreur réseau : skip le produit, le cron rattrapera
- Le sync engine ne doit JAMAIS échouer à cause de l'enrichissement — tout est dans un try/catch

### 4. Cron filet de sécurité

Endpoint `/api/cron/enrich-ean` :
- Schedule : toutes les heures (`0 * * * *`)
- Sélectionne max 50 produits : `ean IS NOT NULL AND canonical_name IS NULL AND created_at > now() - interval '7 days'`
- Ordonne par `created_at DESC` (les plus récents d'abord)
- Appelle `lookupEan` pour chaque (mêmes fonctions que le sync)
- Retourne le compte enrichis/échoués/skippés

### 5. Affichage consommateur

Partout dans l'app où un nom de produit est affiché :
- Utiliser `canonical_name ?? name`
- Composants impactés : feed, recherche, fiche produit, favoris, notifications

## Modifications par fichier

### Fichiers modifiés

| Fichier | Modification |
|---|---|
| `src/lib/ean/lookup.ts` | Passer à l'endpoint payant UPCitemdb (URL + header `user_key`), ajouter rate limiter, ajouter retry sur timeout |
| `src/lib/pos/sync-engine.ts` | Ajouter appel `enrichNewProducts(merchantId)` après la boucle d'upsert, avant `groupVariantsByEAN` |
| `vercel.json` | Ajouter cron `/api/cron/enrich-ean` toutes les heures |

### Nouveaux fichiers

| Fichier | Contenu |
|---|---|
| `src/lib/ean/enrich.ts` | Fonction `enrichNewProducts(merchantId)` — récupère les produits non-enrichis, appelle `lookupEan` pour chaque |
| `src/lib/ean/rate-limiter.ts` | Rate limiter simple : max N req/min, avec sleep si dépassement |
| `src/app/api/cron/enrich-ean/route.ts` | Route cron GET — rattrapage batch des produits non-enrichis |

### Composants UI à modifier (canonical_name ?? name)

Les composants qui affichent des noms de produit devront utiliser `canonical_name ?? name`. Liste exacte à déterminer lors de l'implémentation (grep sur les champs `name` dans les composants produit).

## Configuration

| Variable | Valeur | Où |
|---|---|---|
| `UPCITEMDB_API_KEY` | Clé du plan payant UPCitemdb | `.env` + Vercel env vars |

## Migration DB

**Aucune migration nécessaire.** Toutes les structures existent déjà :
- Table `ean_lookups` (migration 003)
- Colonne `products.canonical_name` (migration 006)
- Colonne `products.brand` (migration 003)
- Colonne `ean_lookups.category` (migration 006)

## Métriques de succès

Après déploiement sur les premiers marchands :
- **Taux d'enrichissement** : % de produits avec EAN qui ont un `canonical_name` (cible : >60% pour les boutiques sneakers)
- **Taux d'EAN** : % de produits qui ont un EAN non-null (dépend du marchand, hors de notre contrôle)
- **Temps de sync** : la sync ne doit pas ralentir de plus de 30 secondes avec l'enrichissement

## Hors scope (phases futures)

- **Phase A.5** : LLM fallback pour produits sans EAN ou non trouvés — décision après mesure du taux de couverture
- **Phase B** : Google Local Inventory Ads — feed Google Merchant Center depuis nos données enrichies
- **Phase C** : Dashboard marchand "Vos produits sur Google" — UI de pilotage

## Dépendances

- Inscription au plan payant UPCitemdb ($10/mois) et récupération de l'API key
- Aucune autre dépendance externe

# Enrichissement unifié + cache propriétaire renforcé — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le pipeline d'enrichissement (EAN, photo, catégorie, vérification IA) réutilisable par toutes les sources de produits (facture, sync POS bootstrap, scan EAN futur, CSV futur), tout en renforçant le cache propriétaire `ean_lookups` pour qu'il se bonifie au fil du temps et réduise les appels APIs externes.

**Architecture cible :**
- **Cache propriétaire mutualisé** : table `ean_lookups` étendue avec taxonomie Two-Step + upload R2 des photos + index trigram pour recherche par nom + télémétrie hit/miss.
- **Module générique `src/lib/enrichment/*`** : briques d'enrichissement extraites de `validate/route.ts` + fonctions privées de `lookup.ts` rendues publiques. Consommé par facture ET sync POS.
- **Queue de validation unifiée** : nouvelle page `/dashboard/stock/review` qui regroupe tout ce qui attend validation marchand (factures + bootstrap POS + sources futures).
- **Produits cachés tant que non validés** : `products.visible = false` jusqu'à confirmation marchand.

**Contexte session :** Session 2026-04-21 — test bootstrap Square avec 30 produits seeds (5 clean / 6 noms vagues / 4 EAN-seul / 4 variantes mal gérées / 3 doublons / 3 artisanaux / 3 incohérents / 2 catégorisation incohérente). Audit a révélé : sync POS = sous-ensemble du pipeline facture (60% de couverture), cache `ean_lookups` existant mais à 40% exploité.

**Tech Stack :** Next.js App Router, Supabase (Postgres + RLS), Claude Haiku 4.5, Serper, R2 via `app/api/images/process`.

**Refs :**
- Spec pipeline enrichissement : `docs/superpowers/specs/2026-04-10-enrichissement-pipeline-design.md`
- Spec dashboard stock : `docs/superpowers/specs/2026-04-19-dashboard-stock-design.md`
- Migration existante cache : `supabase/migrations/003_phase1_tables.sql:77-84` + `006_product_precision.sql:15`

**Out of scope :**
- Writeback POS (écrire enrichissement validé dans Square/Shopify/etc.) — prochain chantier après celui-ci, une fois que la queue de validation est opérationnelle.
- Refacto du flow facture existant — on se limite à EXPORTER/EXTRAIRE, pas à réécrire le flux validé en production.

---

## File Structure

| Action | Path | Responsabilité |
|--------|------|----------------|
| Create | `supabase/migrations/080_ean_lookups_extended.sql` | Colonnes taxonomie + R2 URL + métriques + index trigram |
| Create | `src/lib/enrichment/resolve-ean.ts` | Cascade : cache → 4 sources EAN → reverse-search → Serper photo |
| Create | `src/lib/enrichment/ai-verify.ts` | Re-export `verifyEanMatchWithAI` + signature étendue (image future) |
| Create | `src/lib/enrichment/reverse-search.ts` | Re-export `pickBestCandidate`, `scoreNameMatch`, helpers |
| Create | `src/lib/enrichment/match-product.ts` | Matching par pos_item_id / SKU / EAN / name fuzzy (extrait de `sync-engine.ts` et `validate/route.ts`) |
| Create | `src/lib/enrichment/cache-photo-r2.ts` | Upload photo Serper → R2 (key `ean/{ean}.webp`) + update `ean_lookups.photo_url_r2` |
| Create | `src/lib/enrichment/cache-taxonomy.ts` | Lookup / write cache taxonomie Two-Step (category_id, gender, color, tags) |
| Create | `src/lib/enrichment/telemetry.ts` | `logCacheHit(ean)`, `logCacheMiss(ean, source)` |
| Modify | `src/lib/ean/lookup.ts` | Exporter `pickBestCandidate`, `scoreNameMatch`, `verifyEanMatchWithAI` + brancher `searchEanByName` sur le cache |
| Modify | `src/lib/pos/sync-engine.ts` | Remplacer `enrichNewProducts` local par appel à `resolveAndEnrich` du nouveau module |
| Modify | `src/app/api/invoices/[id]/validate/route.ts` | Remplacer le bloc enrichissement (L419-485) par appel au module `resolve-ean` |
| Create | `src/app/dashboard/stock/review/page.tsx` | Page unifiée liste des produits en attente de validation (tous sources) |
| Create | `src/app/dashboard/stock/review/[id]/page.tsx` | Détail d'une ligne : diff original vs enrichi, boutons Valider/Rejeter |
| Create | `src/components/stock/review-table.tsx` | Table 3 buckets (à valider / validés / rejetés) réutilisant design facture |
| Create | `src/app/api/products/[id]/validate/route.ts` | POST : valide un produit enrichi, met `visible=true` |
| Create | `src/app/api/products/[id]/reject/route.ts` | POST : rejette l'enrichissement proposé, garde original ou supprime |
| Create | `supabase/migrations/081_products_review_status.sql` | Colonnes `review_status`, `enrichment_proposed_at`, `original_name`, `original_image_url` sur `products` |
| Modify | `src/app/discover/page.tsx` (+ autres pages vitrine) | Filtrer `visible=true AND review_status='validated'` |

---

## Task 1 — Migration `ean_lookups` étendue

**Files:**
- Create: `supabase/migrations/080_ean_lookups_extended.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- 080_ean_lookups_extended.sql
-- Cache propriétaire : taxonomie Two-Step + photo R2 + métriques

-- Extension colonnes
ALTER TABLE ean_lookups
    ADD COLUMN IF NOT EXISTS photo_url_r2 text,
    ADD COLUMN IF NOT EXISTS category_id text,
    ADD COLUMN IF NOT EXISTS subcategory_id text,
    ADD COLUMN IF NOT EXISTS gender text,
    ADD COLUMN IF NOT EXISTS color text,
    ADD COLUMN IF NOT EXISTS tags text[],
    ADD COLUMN IF NOT EXISTS canonical_name_normalized text,
    ADD COLUMN IF NOT EXISTS hit_count integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_hit_at timestamptz;

-- Index trigram pour recherche fuzzy par nom (utilisé par searchEanByName)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_ean_lookups_name_trgm
    ON ean_lookups USING gin (canonical_name_normalized gin_trgm_ops);

-- Backfill canonical_name_normalized depuis name existant
UPDATE ean_lookups
SET canonical_name_normalized = lower(regexp_replace(name, '[^a-z0-9\s]', '', 'gi'))
WHERE canonical_name_normalized IS NULL AND name IS NOT NULL;
```

- [ ] **Step 2: Appliquer via `npx supabase db push`**
- [ ] **Step 3: Vérifier via `SELECT column_name FROM information_schema.columns WHERE table_name='ean_lookups';`**
- [ ] **Step 4: Commit — `feat(db): extend ean_lookups with taxonomy, R2 photo, and hit metrics`**

---

## Task 2 — Télémétrie cache

**Files:**
- Create: `src/lib/enrichment/telemetry.ts`

- [ ] **Step 1: Fonctions `logCacheHit(ean)` et `logCacheMiss(ean, source)`**
  - `logCacheHit` : UPDATE `hit_count = hit_count + 1, last_hit_at = now()` WHERE ean
  - `logCacheMiss` : console.log `[cache:miss] ean={ean} source={source}` (pas de persistence, juste observabilité)
- [ ] **Step 2: Instrumenter `lookupEan` dans `src/lib/ean/lookup.ts`** — appeler `logCacheHit(ean)` au retour cache positif, `logCacheMiss(ean, "cache")` au cache miss
- [ ] **Step 3: Commit — `feat(enrichment): add cache telemetry`**

---

## Task 3 — Upload R2 des photos par EAN

**Files:**
- Create: `src/lib/enrichment/cache-photo-r2.ts`
- Modify: `src/lib/ean/lookup.ts` (`cacheResult`)

- [ ] **Step 1: Fonction `uploadPhotoToR2({ ean, sourceUrl })`**
  - Télécharge `sourceUrl` (Serper / EAN-Search)
  - Upload R2 key `ean/{ean}.webp` via le SDK R2 existant (cf. `app/api/images/process/route.ts`)
  - Retourne l'URL R2 publique
- [ ] **Step 2: Dans `cacheResult` (`lookup.ts:540`)** — après insert/update, déclencher `uploadPhotoToR2` en arrière-plan (`after()`) et update `ean_lookups.photo_url_r2`
- [ ] **Step 3: Priorité de lecture** — dans `lookupEan`, renvoyer `photo_url_r2 ?? photo_url` (R2 prioritaire)
- [ ] **Step 4: Commit — `feat(enrichment): rehost EAN photos on R2 for durability`**

---

## Task 4 — Brancher `searchEanByName` sur le cache

**Files:**
- Modify: `src/lib/ean/lookup.ts`

- [ ] **Step 1: Ajouter `searchEanByNameCache(name, brand)`**
  - Normalise `name` (lower + regex strip)
  - SELECT `ean_lookups` WHERE `canonical_name_normalized % normalized_name` (pg_trgm similarity > 0.5) AND `brand` match (si fourni) LIMIT 5
  - Scoring Levenshtein sur les 5 candidats via `pickBestCandidate`
  - Si score ≥ `REVERSE_SEARCH_THRESHOLD` (0.55), retourner directement
- [ ] **Step 2: Dans `searchEanByName` (L298)**, ajouter cette consultation cache AVANT la cascade 4 sources externes
- [ ] **Step 3: Instrumenter — hit/miss log**
- [ ] **Step 4: Tests sur seed Square :** noms "tshirt noir", "chaussures" doivent maintenant taper cache (miss initialement, puis hit sur 2e marchand)
- [ ] **Step 5: Commit — `feat(enrichment): use cache in searchEanByName reverse-search`**

---

## Task 5 — Cache taxonomie Two-Step

**Files:**
- Create: `src/lib/enrichment/cache-taxonomy.ts`
- Modify: `src/lib/ai/categorize.ts`

- [ ] **Step 1: Fonction `getCachedTaxonomy(ean)`** — SELECT `category_id, subcategory_id, gender, color, tags` FROM `ean_lookups` WHERE ean
- [ ] **Step 2: Fonction `cacheTaxonomy(ean, taxonomy)`** — UPDATE ean_lookups avec taxonomie calculée
- [ ] **Step 3: Dans `categorizeMerchantProducts` (L152-255)** :
  - Avant chaque call Claude/Groq, consulter `getCachedTaxonomy(product.ean)` si EAN présent
  - Si cache hit, appliquer directement et skip IA
  - Si cache miss ou pas d'EAN, appel IA classique puis `cacheTaxonomy(ean, result)` si EAN présent
- [ ] **Step 4: Commit — `feat(enrichment): cache Two-Step taxonomy in ean_lookups`**

---

## Task 6 — Exports publics briques enrichissement

**Files:**
- Modify: `src/lib/ean/lookup.ts` (ajouter `export` sur 3 fonctions)
- Create: `src/lib/enrichment/reverse-search.ts`
- Create: `src/lib/enrichment/ai-verify.ts`

- [ ] **Step 1: Dans `lookup.ts`**, préfixer `export` sur :
  - `pickBestCandidate` (L119-150)
  - `scoreNameMatch` (L30)
  - `verifyEanMatchWithAI` (L66-116)
- [ ] **Step 2: Créer `src/lib/enrichment/reverse-search.ts`** — ré-exports de `searchEanByName`, `pickBestCandidate`, `scoreNameMatch` + helpers `normalizeName`, `levenshtein`
- [ ] **Step 3: Créer `src/lib/enrichment/ai-verify.ts`** — ré-exports `verifyEanMatchWithAI` avec signature étendue `{ brand, imageUrl? }` (imageUrl ignoré pour l'instant, placeholder pour vision future)
- [ ] **Step 4: Commit — `refactor(enrichment): expose reverse-search and AI verify as public modules`**

---

## Task 7 — Extract orchestrateur `resolve-ean.ts`

**Files:**
- Create: `src/lib/enrichment/resolve-ean.ts`
- Modify: `src/app/api/invoices/[id]/validate/route.ts`

- [ ] **Step 1: Créer `resolveAndEnrich({ productId, ean, sku, name, brand, merchantId })`** :
  - Cascade : `getCachedTaxonomy(ean)` → `lookupEan(ean)` → si miss et nom présent, `searchEanByName(name, brand)` → si toujours miss, `searchProductImage(name)` fallback photo
  - Retourne `{ ean, name, brand, photo_url, category_id, ... , confidence, source }`
- [ ] **Step 2: Extraire bloc L419-485 de `validate/route.ts`** dans cette fonction, remplacer par appel à `resolveAndEnrich`
- [ ] **Step 3: Tests regression flow facture** — upload facture test, vérifier produits enrichis identiques à avant
- [ ] **Step 4: Commit — `refactor(enrichment): extract resolveAndEnrich orchestrator`**

---

## Task 8 — Module `match-product.ts`

**Files:**
- Create: `src/lib/enrichment/match-product.ts`
- Modify: `src/lib/pos/sync-engine.ts`

- [ ] **Step 1: Créer `matchProduct({ merchantId, posItemId?, sku?, ean?, name })`**
  - Priorité : `pos_item_id` > `ean` > `sku` > `name fuzzy`
  - Retourne `{ productId, matchType: 'pos_item_id'|'ean'|'sku'|'fuzzy'|'new' }`
- [ ] **Step 2: Refactoriser `sync-engine.ts:138-184`** pour utiliser `matchProduct`
- [ ] **Step 3: Refactoriser `validate/route.ts:169-222`** pour utiliser `matchProduct`
- [ ] **Step 4: Commit — `refactor(enrichment): extract matchProduct helper`**

---

## Task 9 — Migration `products.review_status`

**Files:**
- Create: `supabase/migrations/081_products_review_status.sql`

- [ ] **Step 1: Écrire migration**

```sql
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'validated'
        CHECK (review_status IN ('pending_review', 'validated', 'rejected')),
    ADD COLUMN IF NOT EXISTS enrichment_source text,
    ADD COLUMN IF NOT EXISTS enrichment_proposed_at timestamptz,
    ADD COLUMN IF NOT EXISTS original_name text,
    ADD COLUMN IF NOT EXISTS original_image_url text;

CREATE INDEX IF NOT EXISTS idx_products_review_status
    ON products(merchant_id, review_status)
    WHERE review_status = 'pending_review';

-- Backfill : tous les produits existants sont considérés validés
UPDATE products SET review_status = 'validated' WHERE review_status IS NULL;
```

- [ ] **Step 2: Appliquer migration + vérifier**
- [ ] **Step 3: Commit — `feat(db): add review_status on products for validation queue`**

---

## Task 10 — Brancher sync POS sur le module enrichissement

**Files:**
- Modify: `src/lib/pos/sync-engine.ts`

- [ ] **Step 1: Remplacer `enrichNewProducts`** par boucle sur produits sync → `resolveAndEnrich(product)` → UPDATE avec enrichissement proposé
- [ ] **Step 2: Marquer les produits bootstrap comme `review_status='pending_review'`, sauvegarder `original_name` et `original_image_url`**
- [ ] **Step 3: Tests sur les 30 produits Square** — observer la population de `review_status`, vérifier que les EAN-only ("Article", "Produit 1") reçoivent un nom canonique depuis le cache
- [ ] **Step 4: Commit — `feat(pos): use enrichment module in bootstrap sync`**

---

## Task 11 — Page `/dashboard/stock/review` unifiée

**Files:**
- Create: `src/app/dashboard/stock/review/page.tsx`
- Create: `src/app/dashboard/stock/review/[id]/page.tsx`
- Create: `src/components/stock/review-table.tsx`

- [ ] **Step 1: Page liste** — 3 buckets (à valider / validés / rejetés) groupés par source (facture, POS bootstrap, scan, CSV)
- [ ] **Step 2: Page détail produit** — affiche diff : colonne gauche "original POS" (nom brut, photo brute si existe), colonne droite "proposition Two-Step" (nom enrichi, photo R2, catégorie, EAN trouvé). Bouton Valider / Rejeter / Éditer
- [ ] **Step 3: Réutiliser le composant `factures-view.tsx` (tabs bucket)** comme base pour `review-table.tsx`
- [ ] **Step 4: Badge "À valider (N)" dans la nav dashboard** — compte produits où `review_status = 'pending_review'` pour le merchant courant
- [ ] **Step 5: Commit — `feat(dashboard): add unified review queue for products pending validation`**

---

## Task 12 — Endpoints validate/reject produit

**Files:**
- Create: `src/app/api/products/[id]/validate/route.ts`
- Create: `src/app/api/products/[id]/reject/route.ts`

- [ ] **Step 1: POST `/api/products/[id]/validate`** — UPDATE `review_status = 'validated', visible = true, reviewed_at = now()`. Vérifier ownership merchant.
- [ ] **Step 2: POST `/api/products/[id]/reject`** — UPDATE `review_status = 'rejected'`. Body `{ restore_original: boolean }` : si true, UPDATE `name = original_name, image_url = original_image_url` et repasser `review_status = 'validated'` (le marchand rejette l'enrichissement mais garde le produit original). Sinon, laisse rejected et `visible = false`.
- [ ] **Step 3: Bouton "Valider tout" sur page review** — endpoint bulk `/api/products/bulk-validate` (body: array d'IDs)
- [ ] **Step 4: Commit — `feat(api): add product validate/reject endpoints`**

---

## Task 13 — Filtrage vitrine

**Files:**
- Modify: `src/app/discover/page.tsx`
- Modify: tous autres callers de `products` côté vitrine (chercher `from("products")` dans `src/app/**/*` hors `/dashboard/*`)

- [ ] **Step 1: Ajouter filtre `review_status = 'validated'`** en plus du `visible = true` existant, partout où les produits sont listés côté public
- [ ] **Step 2: Tests :** sur les 30 produits Square bootstrap, aucun ne doit apparaître en vitrine avant validation marchand
- [ ] **Step 3: Commit — `feat(vitrine): hide products pending review from public catalog`**

---

## Task 14 — Tests bout en bout sur seed Square

**Files:** (pas de code à ajouter, test manuel)

- [ ] **Step 1: Purger pos_connections** du compte test (SQL : `DELETE FROM pos_connections WHERE merchant_id = <ton_merchant_id>`)
- [ ] **Step 2: Purger products seed** : `DELETE FROM products WHERE merchant_id = <ton_merchant_id> AND pos_provider = 'square'`
- [ ] **Step 3: Reconnecter Square via `/dashboard/settings`** → sync auto déclenche `resolveAndEnrich` sur les 30 produits
- [ ] **Step 4: Ouvrir `/dashboard/stock/review`** → vérifier :
  - Les 5 clean sont proposés avec photo R2 + catégorie complète
  - Les 4 EAN-only ont récupéré leur vrai nom canonique ("Article" → "Bose QuietComfort Ultra Black")
  - Les 6 noms vagues ("tshirt noir") sont flaggés low-confidence
  - Les 3 doublons sont regroupés via `variant_of`
  - Les 3 artisanaux n'ont pas de proposition d'enrichissement
- [ ] **Step 5: Valider qqs produits, rejeter qqs autres** → vérifier `visible` et `review_status` en DB
- [ ] **Step 6: Ouvrir vitrine publique** → vérifier que seuls les validés apparaissent
- [ ] **Step 7: Documenter résultats dans `docs/session-log.md`**

---

## Ordre d'exécution

1. **Couche cache** (Tasks 1-5) : fondations, indépendantes.
2. **Couche modules** (Tasks 6-8) : extraction des briques facture.
3. **Couche queue validation** (Tasks 9-13) : migration + UI + filtrage.
4. **Tests** (Task 14) : validation end-to-end.

**Estim globale** : 4.5 jours (cf. analyse session 2026-04-21).

**Blockers** : aucun. Toutes les briques existent, il s'agit d'extract + cache renforcé.

---

## Post-mortem checklist

Après Task 14 :
- [ ] Hit rate cache sur 2e marchand test : mesurer économies Serper/Claude
- [ ] Logs `[cache:miss]` pendant 1 semaine pour identifier les gaps
- [ ] Si hit rate < 30% après 50 marchands, réviser stratégie cache (fuzzy nom, cross-lingual, etc.)

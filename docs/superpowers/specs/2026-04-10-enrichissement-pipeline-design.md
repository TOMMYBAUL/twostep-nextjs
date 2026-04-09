# Pipeline Enrichissement Produit — Design Spec

*Date : 2026-04-10*
*Statut : En attente de validation Thomas*

---

## Problème

Quand un marchand reçoit une facture fournisseur, on parse les produits (nom, quantité, prix, EAN, SKU). Mais pour que le produit soit présentable au consommateur, il faut : photo officielle, nom complet exact, marque, tailles, catégorie.

Le pipeline actuel (UPCitemdb + Serper Images) est imprécis (~90%), retourne parfois de faux produits (UPC), et la légalité des photos est floue.

## Solution retenue : Fashion Cloud (principal) + Serper Images (fallback)

### Architecture en cascade

```
Facture fournisseur parsée
    ↓
Groupement par modèle (stripSize)
ex: "Nike Dunk Low 42" + "Nike Dunk Low 43" → 1 groupe "Nike Dunk Low"
    ↓
┌─ Étage 1 : Fashion Cloud API ─────────────────────────┐
│  Recherche par EAN (si disponible) ou nom marque+modèle │
│  Retourne : photos HD, EAN, tailles, descriptions,      │
│  matières, couleur, saison                               │
│  Précision : 100% | Légalité : ✅ | Coût : 0€           │
└────────────── trouvé ? → FIN ───────────────────────────┘
    ↓ non trouvé
┌─ Étage 2 : Serper Images (EAN + nom facture) ──────────┐
│  Recherche Google Images avec "EAN nom fiche produit"    │
│  Vérification URL (HEAD check avant de sauvegarder)      │
│  Tri par ratio carré (photos e-commerce > lifestyle)     │
│  Précision : ~90% | Légalité : ⚠️ toléré | Coût : faible│
└────────────── trouvé ? → FIN ───────────────────────────┘
    ↓ non trouvé
┌─ Étage 3 : Pas de photo ──────────────────────────────┐
│  Produit créé SANS photo                                │
│  Notification dashboard : "X produits sans photo"       │
│  Le marchand fournit la photo manuellement              │
└─────────────────────────────────────────────────────────┘
```

### Prérequis marchand

Le marchand doit avoir un compte Fashion Cloud (gratuit) et "suivre" les marques qu'il vend. C'est une étape d'onboarding :

1. Marchand se connecte au dashboard Two-Step
2. On lui demande ses marques principales
3. On l'aide à s'inscrire sur Fashion Cloud et suivre ses marques
4. Son identifiant Fashion Cloud est stocké dans `merchants.fashion_cloud_id`

### Données récupérées par étage

| Donnée | Fashion Cloud | Serper Images | Sans photo |
|--------|:------------:|:-------------:|:----------:|
| Photo HD officielle | ✅ | ✅ approximatif | ❌ |
| Nom officiel complet | ✅ | ❌ (on garde le nom facture) | ❌ |
| EAN par taille | ✅ | ❌ | ❌ |
| Marque | ✅ | ❌ (UPCitemdb avec check cohérence) | ❌ |
| Tailles disponibles | ✅ | ❌ (extractSize du nom facture) | ❌ |
| Couleur | ✅ | ❌ | ❌ |
| Matière/composition | ✅ | ❌ | ❌ |
| Description | ✅ | ❌ | ❌ |

## Pipeline complet : facture → produit présentable

### Étape 1 : Parsing (existant)

```
Email ou upload → parseInvoice()
    PDF → Gemini Flash (ou Claude Haiku)
    CSV/XLSX → spreadsheetParser (détection headers intelligente)

Sortie : { supplier_name, items: [{ name, ean, sku, quantity, unit_price }] }
```

### Étape 2 : Groupement + extraction taille

```
Items facture → grouper par stripSize(name)
    "Nike Dunk Low Black White taille 42" → base: "Nike Dunk Low Black White", size: "42"
    "Nike Dunk Low Black White taille 43" → base: "Nike Dunk Low Black White", size: "43"
    → 1 groupe, sizes: ["42", "43"], total_qty: 6
```

### Étape 3 : Matching produits existants

```
Pour chaque groupe :
    1. Match EAN exact (si EAN dans la facture)
    2. Match SKU exact
    3. Match nom exact (case-insensitive)
    4. Match fuzzy (Levenshtein ≥ 0.7) → pending_review

Si match trouvé :
    → canonical_name = nom nettoyé de la facture (remplace le nom POS)
    → EAN, SKU écrits sur le produit
    → Tailles ajoutées à available_sizes
    → Stock incoming créé

Si pas de match :
    → Nouveau produit créé avec nom nettoyé (stripSize)
    → available_sizes = tailles extraites
    → Stock incoming créé
```

### Étape 4 : Enrichissement (5 workers parallèles)

```
Pour chaque produit nouveau ou mis à jour (en parallèle, max 5) :
    1. Fashion Cloud API → cherche par EAN ou marque+modèle
        Si trouvé : photo HD, EAN complet, marque, couleur, description → FIN
    2. Serper Images → cherche "EAN nom fiche produit"
        Vérification HEAD sur chaque URL candidate
        Tri par ratio carré (préférer photos e-commerce)
        Si trouvé : photo → FIN
    3. Rien trouvé → produit sans photo, notification marchand
```

### Étape 5 : Catégorisation IA (batch)

```
Tous les produits non catégorisés → 1 appel Claude Haiku
    → category_id (principale)
    → subcategory_id
    → secondary_categories (product_tags type="category")
    → brand, color, gender, tags
```

### Étape 6 : Traitement photo (si photo trouvée)

```
Photo brute → rembg (détourage fond) → upload R2 → photo_processed_url
```

## Concurrence et performance

### Workers parallèles

Les étapes 4 et 6 sont parallélisées par produit :

```
35 produits uniques (facture 200 lignes)
    → 5 workers parallèles
    → 7 cycles × ~5 secondes = ~35 secondes total
```

Implémentation : `Promise.allSettled` avec limite de concurrence (p-limit ou manuel).

### Cache permanent

Chaque enrichissement est stocké en base (`ean_lookups`, `products`) :
- Première facture d'un produit : recherche complète (~5s)
- Factures suivantes du même produit : match EAN instantané, 0 appel API

## Coûts

| Service | Usage | Coût |
|---------|-------|------|
| Fashion Cloud | Illimité (gratuit retailers) | 0€ |
| Serper | Fallback seulement (~20% des produits) | ~50$/an |
| UPCitemdb | Marque + catégorie (avec check cohérence) | Gratuit (100 req/jour) |
| rembg VPS | Détourage photos | 6€/mois (existant) |
| Claude Haiku | Catégorisation batch | ~0.01$/batch |
| **Total** | | **~55$/an** |

## Validation UPC — check de cohérence

UPCitemdb peut retourner un faux produit (ex: "Partsynergy" pour une Nike Dunk Low). Avant d'appliquer les données UPC :

```
Si UPC.brand ne contient pas un mot du nom produit
ET le nom produit ne contient pas UPC.brand
→ REJETER les données UPC (brand + category)
→ Loguer le rejet pour monitoring
```

## Validation photo Serper — HEAD check

Avant de sauvegarder une URL Serper :

```
Pour chaque URL candidate (trié par score carré) :
    HEAD request, timeout 4s
    Si 200 → sauvegarder cette URL
    Si 404/timeout → passer à la suivante
```

## Gestion des types de marchands

| Type | Pipeline automatique | Entrée manuelle |
|------|:-------------------:|:---------------:|
| Revendeur multi-marques | ✅ 100% couvert | — |
| Hybride (marques + propre label) | ✅ Pour les marques | Propre label seulement |
| Dépôt-vente / consignation | ✅ Si bon de consignation parsable | Sinon oui |
| Créateur / artisan pur | — | ✅ Tout manuellement |
| Franchise | ✅ Si facture/BL standard | — |

## Format available_sizes

Stockage base : `["S", "M", "L"]` (array de strings dans JSONB)

API GET `/api/products/[id]` normalise en `[{size: "S", quantity: N}]` avant de servir au frontend, en distribuant le stock total proportionnellement.

## Migration requise

```sql
-- 055_photo_source_serper.sql (déjà créé, à appliquer)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_photo_source_check;
ALTER TABLE products ADD CONSTRAINT products_photo_source_check
  CHECK (photo_source IN ('pos', 'ean', 'manual', 'serper', 'fashion_cloud'));

-- 056_fashion_cloud.sql (nouveau)
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS fashion_cloud_id TEXT;
```

## Fichiers impactés

### Nouveaux
- `src/lib/enrichment/fashion-cloud.ts` — client API Fashion Cloud
- `src/lib/enrichment/pipeline.ts` — orchestrateur cascade (FC → Serper → rien)
- `src/lib/enrichment/worker-pool.ts` — pool de 5 workers parallèles

### Modifiés
- `src/lib/ean/lookup.ts` — UPC cohérence check (déjà fait)
- `src/lib/images/serper.ts` — HEAD check + tri ratio carré (déjà fait)
- `src/lib/ean/enrich.ts` — appeler le nouveau pipeline au lieu de l'ancien
- `src/app/api/invoices/[id]/validate/route.ts` — stripSize + canonical_name (déjà fait)
- `src/app/api/discover/route.ts` — multi-catégorie (déjà fait)

## Hors scope

- Google Merchant Center (pas d'API lookup publique — vérifié)
- Firecrawl scraping (coût 5x, même zone grise légale que Serper, EAN non trouvé — testé)
- Enrichissement des produits artisanaux (entrée manuelle par le marchand)
- Performance chargement app (à traiter dans une session dédiée)

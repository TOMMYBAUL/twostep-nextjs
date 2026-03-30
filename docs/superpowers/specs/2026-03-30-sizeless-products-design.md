# Produits sans taille dans le feed "Pour toi"

**Date** : 2026-03-30
**Statut** : Valide par Thomas

## Probleme

Les produits sans taille (montres, bijoux, nourriture, beaute, sport, deco) sont exclus du feed "Pour toi" et des suggestions. Le filtre de taille ne retourne que les produits ayant une correspondance dans `available_sizes` — les produits sans taille disparaissent.

## Principe

Un produit avec `available_sizes` vide (`[]`) ou null est un produit "taille unique" qui convient a tout le monde. Il doit passer automatiquement a travers le filtre de taille, au meme titre qu'un produit dont la taille correspond aux preferences utilisateur.

**Pas de hardcoding par categorie.** La detection est dynamique, basee sur la presence ou l'absence de `available_sizes` au niveau de chaque produit.

## Design

### Logique de filtrage (identique partout)

Un produit est visible si :
1. `filter_size` n'est pas fourni (pas de filtre actif), OU
2. `available_sizes` est NULL (produit sans taille), OU
3. `available_sizes` est un tableau vide `[]` (produit sans taille), OU
4. `available_sizes` contient une entree avec la taille demandee et `quantity > 0`

### Points de modification

6 filtres identiques a mettre a jour :

| # | Emplacement | Type |
|---|---|---|
| 1 | `get_feed_nearby` RPC | SQL |
| 2 | `get_promos_nearby` RPC | SQL |
| 3 | `get_products_nearby` RPC | SQL |
| 4 | `get_products_nearby_count` RPC | SQL |
| 5 | `get_merchants_nearby` RPC | SQL |
| 6 | `by-merchants/route.ts` filtre JS | TypeScript |

### SQL (RPCs 1-4)

```sql
-- Avant
AND (filter_size IS NULL OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p.available_sizes) elem
    WHERE elem->>'size' = filter_size AND (elem->>'quantity')::int > 0
))

-- Apres
AND (filter_size IS NULL
    OR p.available_sizes IS NULL
    OR jsonb_array_length(p.available_sizes) = 0
    OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.available_sizes) elem
        WHERE elem->>'size' = filter_size AND (elem->>'quantity')::int > 0
    ))
```

### SQL (RPC 5 — `get_merchants_nearby`)

```sql
-- Avant
AND (filter_size IS NULL OR EXISTS (
    SELECT 1 FROM products p3
    WHERE p3.merchant_id = m.id
      AND p3.available_sizes IS NOT NULL
      AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(p3.available_sizes) elem
          WHERE elem->>'size' = filter_size AND (elem->>'quantity')::int > 0
      )
))

-- Apres
AND (filter_size IS NULL OR EXISTS (
    SELECT 1 FROM products p3
    WHERE p3.merchant_id = m.id
      AND (
          p3.available_sizes IS NULL
          OR jsonb_array_length(p3.available_sizes) = 0
          OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(p3.available_sizes) elem
              WHERE elem->>'size' = filter_size AND (elem->>'quantity')::int > 0
          )
      )
))
```

### TypeScript (`by-merchants/route.ts`)

```typescript
// Avant
if (userSizes.length > 0) {
    result = mapped.filter((p: any) =>
        userSizes.some((s) => hasSizeInStock(p._availableSizes, s)),
    );
}

// Apres
if (userSizes.length > 0) {
    result = mapped.filter((p: any) =>
        !Array.isArray(p._availableSizes) || p._availableSizes.length === 0 ||
        userSizes.some((s) => hasSizeInStock(p._availableSizes, s)),
    );
}
```

## Ce qui ne change PAS

- Structure du feed (boutiques suivies puis suggestions)
- Blocage du feed sans preferences de taille
- UI des cartes produit
- Logique de tri (promos en premier, distance, feed_score)

## Comportement attendu

| Produit | available_sizes | Utilisateur taille M/42 | Visible ? |
|---|---|---|---|
| T-shirt | `[{"size":"M","quantity":2}]` | M matche | Oui |
| T-shirt | `[{"size":"S","quantity":3}]` | M ne matche pas | Non |
| Montre | `null` | Taille unique | Oui |
| Bougie | `[]` | Taille unique | Oui |

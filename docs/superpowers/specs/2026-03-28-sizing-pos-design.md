# Tailles & pointures connectées au POS — Design spec

## Contexte

L'app consumer a des filtres taille (XS-XXL) et pointure (35-47) sur la page Discover, et le consommateur peut renseigner ses préférences dans l'onboarding. Mais la table `products` n'a pas de colonne `size` — les filtres ne filtrent rien en base. Les adaptateurs POS importent les variants comme des produits séparés (ex: "Nike Air Max — 42") sans extraire la taille.

## Changements

### 1. Migration — colonne `size` sur `products`

Ajouter `size TEXT` nullable sur la table `products`. Pas de contrainte check — le parsing gère la validation.

### 2. Fonction utilitaire `extractSize(name: string): string | null`

**Fichier :** `src/lib/pos/extract-size.ts`

Parse le nom d'un produit ou d'une variant pour en extraire la taille. Deux patterns :

- **Taille vêtement** : XS, S, M, L, XL, XXL (insensible à la casse, mot isolé)
- **Pointure** : nombre entre 35 et 48, entier ou demi (35, 35.5, 36, ..., 47, 47.5, 48)

Règles :
- Cherche après un séparateur courant (`—`, `-`, `–`, `/`, `Taille`, `Size`, `T.`) ou en fin de chaîne
- Retourne la première correspondance trouvée, normalisée en majuscules pour les tailles vêtement
- Retourne `null` si rien ne matche

Exemples :
- `"Nike Air Max — 42"` → `"42"`
- `"T-shirt coton — M"` → `"M"`
- `"Clifton 9 — Taille 43"` → `"43"`
- `"Jean slim 42.5"` → `"42.5"`
- `"Vase en grès"` → `null`
- `"Robe fleurie — S"` → `"S"`
- `"Pack 3 chaussettes"` → `null` (3 n'est pas dans la plage 35-48)

### 3. Sync engine — stocker la taille à l'import

**Fichier :** `src/lib/pos/sync-engine.ts`

Dans la fonction `upsertProduct`, après avoir construit l'objet produit, appeler `extractSize(product.name)` et stocker le résultat dans la colonne `size`.

### 4. API Discover — filtrer par taille

**Fichier :** `src/app/api/discover/route.ts`

Accepter un paramètre `size` dans la query string. Si présent, ajouter un filtre `.eq("size", size)` sur la requête Supabase.

### 5. UI Discover — connecter les filtres existants

**Fichier :** `src/app/(consumer)/discover/page.tsx`

Les filtres taille vêtement et pointure existent déjà (`sizeFilter` et `shoeSizeFilter` states). Passer ces valeurs comme paramètre `size` aux appels `useDiscoverFeed()`. Le hook ajoute `&size=M` ou `&size=42` à la requête API.

### 6. Rétro-remplissage des produits existants

Script one-shot : parcourir tous les produits existants, appeler `extractSize(name)` sur chacun, et mettre à jour la colonne `size`. À exécuter une fois après la migration.

## Ce qui ne change pas

- Les préférences consommateur (`preferred_clothing_size`, `preferred_shoe_size`) sur le profil — inchangées
- L'onboarding sizing dans WelcomeGate — inchangé
- La structure des adaptateurs POS (types.ts, square.ts, shopify.ts, etc.) — inchangée
- Le type `POSProduct` — pas besoin d'ajouter `size` car le parsing se fait sur le nom

## Stack technique

- 1 nouvelle migration Supabase (colonne `size`)
- 1 nouveau fichier utilitaire (`extract-size.ts`)
- Modifications mineures : sync-engine, API discover, page discover

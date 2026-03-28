# Sizing POS — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connecter les tailles/pointures des variants POS aux filtres de la consumer app — du POS au filtre Discover.

**Architecture:** Ajout colonne `size` sur `products`, fonction `extractSize()` qui parse les noms de variants, injection dans le sync engine, filtrage côté API discover, connexion des filtres UI existants.

**Tech Stack:** Supabase (migration), TypeScript, Next.js API routes.

---

## File Structure

| Action | File | Responsabilité |
|--------|------|----------------|
| Create | `supabase/migrations/023_product_size.sql` | Colonne `size` + index |
| Create | `src/lib/pos/extract-size.ts` | Parser taille depuis nom variant |
| Modify | `src/lib/pos/sync-engine.ts` | Appeler extractSize à l'upsert |
| Modify | `src/app/api/discover/route.ts` | Accepter paramètre `size` |
| Modify | `src/app/(consumer)/discover/page.tsx` | Connecter filtres UI à l'API |

---

### Task 1: Migration — colonne `size` sur `products`

**Files:**
- Create: `supabase/migrations/023_product_size.sql`

- [ ] **Step 1: Écrire la migration**

```sql
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS size TEXT;

CREATE INDEX idx_products_size ON products (size) WHERE size IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/023_product_size.sql
git commit -m "feat: add size column to products table"
```

---

### Task 2: Fonction extractSize

**Files:**
- Create: `src/lib/pos/extract-size.ts`

- [ ] **Step 1: Écrire la fonction**

```typescript
const CLOTHING_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const CLOTHING_REGEX = /(?:^|[\s—–\-\/,()]+|(?:taille|size|t\.)\s*)(?<size>XXS|XS|XXL|XXXL|XL|S|M|L)(?:\s*$|[\s—–\-\/,()]+|$)/i;

const SHOE_REGEX = /(?:^|[\s—–\-\/,()]+|(?:taille|size|t\.)\s*)(?<size>(?:3[5-9]|4[0-8])(?:\.5)?)(?:\s*$|[\s—–\-\/,()]+|$)/;

export function extractSize(name: string): string | null {
    if (!name) return null;

    // Try shoe size first (more specific — avoids matching "S" in words)
    const shoeMatch = name.match(SHOE_REGEX);
    if (shoeMatch?.groups?.size) {
        return shoeMatch.groups.size;
    }

    // Try clothing size
    const clothingMatch = name.match(CLOTHING_REGEX);
    if (clothingMatch?.groups?.size) {
        return clothingMatch.groups.size.toUpperCase();
    }

    return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pos/extract-size.ts
git commit -m "feat: add extractSize utility for parsing sizes from product names"
```

---

### Task 3: Sync engine — stocker la taille à l'import

**Files:**
- Modify: `src/lib/pos/sync-engine.ts`

- [ ] **Step 1: Ajouter l'import**

En haut du fichier, après les imports existants, ajouter :

```typescript
import { extractSize } from "@/lib/pos/extract-size";
```

- [ ] **Step 2: Modifier updateProduct pour inclure `size`**

Dans la fonction `updateProduct` (ligne 227), ajouter `size` dans l'objet `.update()` :

```typescript
async function updateProduct(
    supabase: Awaited<ReturnType<typeof createClient>>,
    productId: string,
    existingPhotoUrl: string | null,
    provider: string,
    posProduct: POSProduct,
): Promise<void> {
    await supabase
        .from("products")
        .update({
            name: posProduct.name,
            price: posProduct.price,
            ean: posProduct.ean,
            pos_item_id: posProduct.pos_item_id,
            pos_provider: provider,
            photo_url: posProduct.photo_url ?? existingPhotoUrl,
            size: extractSize(posProduct.name),
        })
        .eq("id", productId);
}
```

- [ ] **Step 3: Modifier le RPC create_product_with_stock ou ajouter un update post-création**

Après l'appel à `create_product_with_stock` dans `upsertProduct` (ligne 210-224), ajouter un update pour setter la taille :

```typescript
    // Match 3: create new product
    const { data: created, error: createError } = await supabase.rpc("create_product_with_stock", {
        p_merchant_id: merchantId,
        p_name: posProduct.name,
        p_price: posProduct.price,
        p_ean: posProduct.ean,
        p_category: posProduct.category,
        p_photo_url: posProduct.photo_url,
        p_pos_item_id: posProduct.pos_item_id,
        p_pos_provider: provider,
    });

    if (createError) throw new Error(`create_product_with_stock failed: ${createError.message}`);

    // Set size after creation
    const size = extractSize(posProduct.name);
    if (size) {
        await supabase.from("products").update({ size }).eq("id", created as string);
    }

    result.products_created++;
    return created as string;
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/pos/sync-engine.ts
git commit -m "feat: extract and store product size during POS sync"
```

---

### Task 4: API Discover — filtrer par taille

**Files:**
- Modify: `src/app/api/discover/route.ts`

- [ ] **Step 1: Lire le paramètre `size`**

Après la ligne `const { lat, lng, radius, section, category } = parsed.data;` (ligne 12), ajouter :

```typescript
    const size = request.nextUrl.searchParams.get("size");
```

- [ ] **Step 2: Filtrer les résultats par taille**

Dans la section `promos` (après le filtre category, ligne 43), ajouter un filtre size :

```typescript
            .filter((row: any) => !category || categoryMap.get(row.product_id) === category)
            .filter((row: any) => !size || row.product_size === size)
```

Note : le RPC `get_promos_nearby` ne retourne pas `product_size`. Il faut résoudre les tailles comme on résout les catégories. Ajouter une fonction `resolveSizes` et l'appeler :

```typescript
async function resolveSizes(
    supabase: any,
    productIds: string[],
): Promise<Map<string, string>> {
    if (productIds.length === 0) return new Map();
    const { data } = await supabase
        .from("products")
        .select("id, size")
        .in("id", productIds)
        .not("size", "is", null);
    const map = new Map<string, string>();
    for (const row of data ?? []) {
        map.set(row.id, row.size);
    }
    return map;
}
```

Dans la section `promos`, après `resolveCategories`, ajouter :

```typescript
        const sizeMap = size ? await resolveSizes(supabase, productIds) : new Map<string, string>();
```

Et filtrer :

```typescript
            .filter((row: any) => !size || sizeMap.get(row.product_id) === size)
```

Dans la section `trending/nearby`, même pattern — après `resolveCategories`, ajouter la résolution de tailles et le filtre :

```typescript
    const sizeMap = size ? await resolveSizes(supabase, productIds) : new Map<string, string>();
```

Après le filtre category (ligne 97) :

```typescript
    if (size) {
        items = items.filter((row: any) => sizeMap.get(row.product_id) === size);
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/discover/route.ts
git commit -m "feat: add size filter to discover API"
```

---

### Task 5: UI Discover — connecter les filtres existants

**Files:**
- Modify: `src/app/(consumer)/discover/page.tsx`

- [ ] **Step 1: Modifier useDiscoverFeed pour accepter `size`**

Changer la signature et le corps de `useDiscoverFeed` :

```typescript
function useDiscoverFeed(lat: number, lng: number, section: "promos" | "trending" | "nearby", category: string | null, size: string | null) {
    return useQuery<DiscoverProduct[]>({
        queryKey: ["discover", section, lat, lng, category, size],
        queryFn: async () => {
            const params = new URLSearchParams({
                lat: lat.toString(),
                lng: lng.toString(),
                section,
                radius: "10",
            });
            if (category) params.set("category", category);
            if (size) params.set("size", size);
            const res = await fetch(`/api/discover?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        staleTime: 30_000,
    });
}
```

- [ ] **Step 2: Mettre à jour les appels useDiscoverFeed**

Trouver les 3 appels (promos, trending, nearby) et ajouter le paramètre `size`. Calculer la valeur size active :

```typescript
    const activeSize = sizeFilter ?? (shoeSizeFilter ? String(shoeSizeFilter) : null);

    const { data: promos, isLoading: loadingPromos } = useDiscoverFeed(lat, lng, "promos", activeCategory, activeSize);
    const { data: trending, isLoading: loadingTrending } = useDiscoverFeed(lat, lng, "trending", activeCategory, activeSize);
    const { data: nearby, isLoading: loadingNearby } = useDiscoverFeed(lat, lng, "nearby", activeCategory, activeSize);
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(consumer)/discover/page.tsx"
git commit -m "feat: connect size filters to discover API"
```

---

### Task 6: Rétro-remplissage des produits existants

**Files:**
- Create: `scripts/backfill-sizes.ts`

- [ ] **Step 1: Écrire le script**

```typescript
import { createClient } from "@supabase/supabase-js";

const CLOTHING_REGEX = /(?:^|[\s—–\-\/,()]+|(?:taille|size|t\.)\s*)(?<size>XXS|XS|XXL|XXXL|XL|S|M|L)(?:\s*$|[\s—–\-\/,()]+|$)/i;
const SHOE_REGEX = /(?:^|[\s—–\-\/,()]+|(?:taille|size|t\.)\s*)(?<size>(?:3[5-9]|4[0-8])(?:\.5)?)(?:\s*$|[\s—–\-\/,()]+|$)/;

function extractSize(name: string): string | null {
    if (!name) return null;
    const shoeMatch = name.match(SHOE_REGEX);
    if (shoeMatch?.groups?.size) return shoeMatch.groups.size;
    const clothingMatch = name.match(CLOTHING_REGEX);
    if (clothingMatch?.groups?.size) return clothingMatch.groups.size.toUpperCase();
    return null;
}

async function main() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: products, error } = await supabase
        .from("products")
        .select("id, name")
        .is("size", null);

    if (error) { console.error(error); process.exit(1); }

    let updated = 0;
    for (const p of products ?? []) {
        const size = extractSize(p.name);
        if (size) {
            await supabase.from("products").update({ size }).eq("id", p.id);
            updated++;
            console.log(`  ${p.name} → ${size}`);
        }
    }

    console.log(`\nDone: ${updated}/${(products ?? []).length} products updated with size.`);
}

main();
```

- [ ] **Step 2: Exécuter le script**

```bash
npx tsx scripts/backfill-sizes.ts
```

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-sizes.ts
git commit -m "feat: add backfill script for product sizes"
```

---

### Task 7: Vérification TypeScript + build

- [ ] **Step 1: Vérifier TypeScript**

```bash
npx tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 2: Build production**

```bash
npx next build
```

Expected: build réussi.

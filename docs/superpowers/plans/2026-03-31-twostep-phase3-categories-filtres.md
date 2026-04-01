# Two-Step Phase 3 — Catégories, Filtres & Auto-catégorisation IA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les 8 catégories hardcodées par un arbre hiérarchique en DB (15 catégories, ~80 sous-catégories), ajouter des filtres dynamiques contextuels, implémenter l'auto-catégorisation IA des produits POS, et refondre la navigation consumer (pills dynamiques + drawer + panneau filtres).

**Architecture:** Table `categories` avec parent_id pour l'arbre. Table `product_tags` pour les tags (marque, couleur, genre, style). API route `/api/categorize` appelle Claude Haiku en batch pour catégoriser les produits d'un marchand. Le frontend charge les catégories depuis Supabase (plus de constante en dur) et affiche des pills dynamiques + un drawer bottom sheet pour l'arbre complet.

**Tech Stack:** Supabase (migrations SQL, RPC), Anthropic Claude Haiku API (batch categorization), Next.js 15, React 19, Vaul (drawer/bottom sheet), motion (Framer Motion), Tailwind CSS v4.1

---

## File Map

| Action | Fichier | Responsabilité |
|--------|---------|---------------|
| Create | `supabase/migrations/041_categories_tree.sql` | Table categories + seed 15 cat + ~80 sous-cat |
| Create | `supabase/migrations/042_product_tags.sql` | Table product_tags + colonnes category_id/subcategory_id sur products + primary_category_id sur merchants |
| Create | `supabase/migrations/043_category_corrections.sql` | Table corrections marchands |
| Create | `src/lib/ai/categorize.ts` | Pipeline auto-catégorisation IA (prompt + parsing) |
| Create | `src/app/api/categorize/route.ts` | API route POST pour lancer la catégorisation d'un marchand |
| Create | `src/app/(consumer)/components/category-pills.tsx` | Pills dynamiques (top catégories + bouton "Tout") |
| Create | `src/app/(consumer)/components/category-drawer.tsx` | Drawer bottom sheet avec arbre complet |
| Create | `src/app/(consumer)/components/filter-panel.tsx` | Panneau de filtres contextuels (marque, couleur, prix, taille) |
| Create | `src/hooks/use-categories.ts` | Hook React Query pour charger les catégories depuis Supabase |
| Modify | `src/lib/categories.ts` | Garder CATEGORY_SEO pour les pages SEO, supprimer CONSUMER_CATEGORIES |
| Modify | `src/app/(consumer)/discover/page.tsx` | Remplacer CONSUMER_CATEGORIES par CategoryPills dynamiques |
| Modify | `src/app/(consumer)/explore/page.tsx` | Remplacer CONSUMER_CATEGORIES par CategoryPills dynamiques |
| Modify | `src/app/(consumer)/search/page.tsx` | Remplacer CONSUMER_CATEGORIES par CategoryPills dynamiques + FilterPanel |
| Modify | `src/lib/pos/sync-engine.ts` | Appeler auto-catégorisation après sync |
| Modify | `src/app/api/discover/route.ts` | Filtrer par category_id au lieu de string category |
| Modify | `src/app/api/search/route.ts` | Enrichir l'autocomplete avec les tags |

---

## BLOC A — Base de données (Tasks 1-3)

### Task 1: Migration — Table categories + seed data

**Files:**
- Create: `supabase/migrations/041_categories_tree.sql`

- [ ] **Step 1: Créer la migration**

```sql
-- Hierarchical categories (2 levels)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    emoji TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON categories(parent_id, sort_order);
CREATE INDEX idx_categories_slug ON categories(slug);

-- RLS: everyone can read categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_read_all" ON categories FOR SELECT USING (true);
CREATE POLICY "categories_admin_write" ON categories FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM merchants WHERE user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM merchants WHERE user_id = auth.uid()));

-- ═══ SEED: 15 Level-1 categories ═══

INSERT INTO categories (slug, label, emoji, parent_id, sort_order) VALUES
('mode', 'Mode', '👗', NULL, 1),
('chaussures', 'Chaussures', '👟', NULL, 2),
('beaute', 'Beauté', '💄', NULL, 3),
('bijoux-accessoires', 'Bijoux & Accessoires', '💎', NULL, 4),
('sport-outdoor', 'Sport & Outdoor', '⚽', NULL, 5),
('tech-electronique', 'Tech & Électronique', '📱', NULL, 6),
('maison-deco', 'Maison & Déco', '🏠', NULL, 7),
('alimentation', 'Alimentation', '🍷', NULL, 8),
('enfants', 'Enfants', '🧸', NULL, 9),
('culture-loisirs', 'Culture & Loisirs', '📚', NULL, 10),
('sante-bien-etre', 'Santé & Bien-être', '💊', NULL, 11),
('animaux', 'Animaux', '🐾', NULL, 12),
('auto-mobilite', 'Auto & Mobilité', '🚗', NULL, 13),
('bricolage-jardin', 'Bricolage & Jardin', '🔧', NULL, 14),
('seconde-main', 'Seconde main', '♻️', NULL, 15);

-- ═══ SEED: Level-2 subcategories ═══

-- Mode
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('mode-femme', 'Femme', 1),
    ('mode-homme', 'Homme', 2),
    ('mode-enfant', 'Enfant', 3),
    ('mode-lingerie', 'Lingerie', 4),
    ('mode-grande-taille', 'Grande taille', 5),
    ('mode-vintage', 'Vintage', 6),
    ('mode-ceremonie', 'Cérémonie', 7)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'mode';

-- Chaussures
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('chaussures-sneakers', 'Sneakers', 1),
    ('chaussures-ville', 'Ville', 2),
    ('chaussures-sport', 'Sport', 3),
    ('chaussures-enfant', 'Enfant', 4),
    ('chaussures-bottes', 'Bottes', 5),
    ('chaussures-sandales', 'Sandales', 6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'chaussures';

-- Beauté
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('beaute-parfums', 'Parfums', 1),
    ('beaute-maquillage', 'Maquillage', 2),
    ('beaute-soins', 'Soins', 3),
    ('beaute-cheveux', 'Cheveux', 4),
    ('beaute-barbe', 'Barbe', 5),
    ('beaute-bio', 'Bio / Naturel', 6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'beaute';

-- Bijoux & Accessoires
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('bijoux-bijoux', 'Bijoux', 1),
    ('bijoux-montres', 'Montres', 2),
    ('bijoux-lunettes', 'Lunettes', 3),
    ('bijoux-sacs', 'Sacs', 4),
    ('bijoux-maroquinerie', 'Maroquinerie', 5),
    ('bijoux-chapeaux', 'Chapeaux', 6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'bijoux-accessoires';

-- Sport & Outdoor
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('sport-running', 'Running', 1),
    ('sport-velo', 'Vélo', 2),
    ('sport-fitness', 'Fitness', 3),
    ('sport-raquettes', 'Raquettes', 4),
    ('sport-montagne', 'Montagne', 5),
    ('sport-glisse', 'Glisse', 6),
    ('sport-equitation', 'Équitation', 7),
    ('sport-arts-martiaux', 'Arts martiaux', 8)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'sport-outdoor';

-- Tech & Électronique
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('tech-telephones', 'Téléphones', 1),
    ('tech-audio', 'Audio / Hi-Fi', 2),
    ('tech-photo', 'Photo', 3),
    ('tech-gaming', 'Gaming', 4),
    ('tech-informatique', 'Informatique', 5),
    ('tech-domotique', 'Domotique', 6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'tech-electronique';

-- Maison & Déco
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('maison-deco-interieur', 'Déco', 1),
    ('maison-cuisine', 'Cuisine', 2),
    ('maison-linge', 'Linge', 3),
    ('maison-luminaires', 'Luminaires', 4),
    ('maison-bougies', 'Bougies', 5),
    ('maison-literie', 'Literie', 6),
    ('maison-jardin', 'Jardin', 7)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'maison-deco';

-- Alimentation
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('alim-vins', 'Vins & Spiritueux', 1),
    ('alim-epicerie-fine', 'Épicerie fine', 2),
    ('alim-the-cafe', 'Thé & Café', 3),
    ('alim-bio', 'Bio', 4),
    ('alim-chocolat', 'Chocolat', 5),
    ('alim-biere-craft', 'Bière craft', 6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'alimentation';

-- Enfants
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('enfants-jouets', 'Jouets', 1),
    ('enfants-puericulture', 'Puériculture', 2),
    ('enfants-jeux-societe', 'Jeux de société', 3),
    ('enfants-figurines', 'Figurines', 4),
    ('enfants-modelisme', 'Modélisme', 5)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'enfants';

-- Culture & Loisirs
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('culture-livres', 'Livres', 1),
    ('culture-bd-manga', 'BD & Manga', 2),
    ('culture-vinyles', 'Vinyles', 3),
    ('culture-instruments', 'Instruments', 4),
    ('culture-papeterie', 'Papeterie', 5),
    ('culture-beaux-arts', 'Beaux-arts', 6)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'culture-loisirs';

-- Santé & Bien-être
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('sante-pharmacie', 'Pharmacie', 1),
    ('sante-optique', 'Optique', 2),
    ('sante-parapharmacie', 'Parapharmacie', 3),
    ('sante-herboristerie', 'Herboristerie', 4),
    ('sante-nutrition', 'Nutrition sportive', 5)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'sante-bien-etre';

-- Animaux
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('animaux-chien-chat', 'Chien & Chat', 1),
    ('animaux-aquariophilie', 'Aquariophilie', 2),
    ('animaux-equitation', 'Équitation', 3)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'animaux';

-- Auto & Mobilité
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('auto-accessoires', 'Accessoires auto', 1),
    ('auto-moto', 'Moto', 2),
    ('auto-velo-electrique', 'Vélo électrique', 3),
    ('auto-trottinette', 'Trottinette', 4)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'auto-mobilite';

-- Bricolage & Jardin
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('bricolage-outillage', 'Outillage', 1),
    ('bricolage-quincaillerie', 'Quincaillerie', 2),
    ('bricolage-peinture', 'Peinture', 3),
    ('bricolage-jardinerie', 'Jardinerie', 4),
    ('bricolage-piscine', 'Piscine', 5)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'bricolage-jardin';

-- Seconde main
INSERT INTO categories (slug, label, parent_id, sort_order)
SELECT slug, label, p.id, s.sort_order
FROM (VALUES
    ('seconde-depot-vente', 'Dépôt-vente luxe', 1),
    ('seconde-tech-reconditionne', 'Tech reconditionné', 2),
    ('seconde-brocante', 'Brocante', 3)
) AS s(slug, label, sort_order)
CROSS JOIN categories p WHERE p.slug = 'seconde-main';

-- ═══ RPC: get categories tree ═══

CREATE OR REPLACE FUNCTION get_categories_tree()
RETURNS TABLE (
    id UUID,
    slug TEXT,
    label TEXT,
    emoji TEXT,
    parent_id UUID,
    parent_slug TEXT,
    sort_order INTEGER
) AS $$
SELECT
    c.id, c.slug, c.label, c.emoji, c.parent_id,
    p.slug AS parent_slug,
    c.sort_order
FROM categories c
LEFT JOIN categories p ON p.id = c.parent_id
WHERE c.is_active = true
ORDER BY COALESCE(p.sort_order, c.sort_order), c.parent_id NULLS FIRST, c.sort_order;
$$ LANGUAGE sql STABLE;
```

- [ ] **Step 2: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/041_categories_tree.sql
git commit -m "feat(Phase3): add categories table with 15 L1 + ~80 L2 seed data"
```

---

### Task 2: Migration — Product tags & category columns

**Files:**
- Create: `supabase/migrations/042_product_tags.sql`

- [ ] **Step 1: Créer la migration**

```sql
-- Product tags (brand, color, gender, style, etc.)
CREATE TABLE product_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_type TEXT NOT NULL,
    tag_value TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ai',
    confidence INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, tag_type, tag_value)
);

CREATE INDEX idx_product_tags_product ON product_tags(product_id);
CREATE INDEX idx_product_tags_type_value ON product_tags(tag_type, tag_value);
CREATE INDEX idx_product_tags_type ON product_tags(tag_type);

ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_read_all" ON product_tags FOR SELECT USING (true);
CREATE POLICY "tags_write_merchant" ON product_tags FOR ALL TO authenticated
    USING (product_id IN (SELECT id FROM products WHERE merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())))
    WITH CHECK (product_id IN (SELECT id FROM products WHERE merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())));

-- Add category columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_categorized_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_confidence INTEGER;

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_subcategory ON products(subcategory_id);

-- Add primary category to merchants
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS primary_category_id UUID REFERENCES categories(id);

-- RPC: get available filter values for a category in a radius
CREATE OR REPLACE FUNCTION get_filter_values(
    p_category_slug TEXT,
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS TABLE (
    tag_type TEXT,
    tag_value TEXT,
    count BIGINT
) AS $$
SELECT
    pt.tag_type,
    pt.tag_value,
    COUNT(DISTINCT pt.product_id) AS count
FROM product_tags pt
JOIN products p ON p.id = pt.product_id
JOIN stock s ON s.product_id = p.id AND s.quantity > 0
JOIN merchants m ON m.id = p.merchant_id
JOIN categories c ON c.id = p.category_id
WHERE c.slug = p_category_slug
  AND p.visible IS NOT false
  AND p.variant_of IS NULL
  AND earth_distance(ll_to_earth(p_lat, p_lng), ll_to_earth(m.lat, m.lng)) / 1000 <= p_radius_km
GROUP BY pt.tag_type, pt.tag_value
HAVING COUNT(DISTINCT pt.product_id) >= 1
ORDER BY pt.tag_type, count DESC;
$$ LANGUAGE sql STABLE;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/042_product_tags.sql
git commit -m "feat(Phase3): add product_tags table + category columns + filter RPC"
```

---

### Task 3: Migration — Category corrections

**Files:**
- Create: `supabase/migrations/043_category_corrections.sql`

- [ ] **Step 1: Créer la migration**

```sql
-- Merchant corrections for AI categorization (for learning)
CREATE TABLE category_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    original_category_id UUID REFERENCES categories(id),
    corrected_category_id UUID NOT NULL REFERENCES categories(id),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_corrections_merchant ON category_corrections(merchant_id);

ALTER TABLE category_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corrections_own" ON category_corrections FOR ALL TO authenticated
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()))
    WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/043_category_corrections.sql
git commit -m "feat(Phase3): add category_corrections table"
```

---

## BLOC B — Pipeline IA (Tasks 4-5)

### Task 4: Auto-catégorisation IA — Module core

**Files:**
- Create: `src/lib/ai/categorize.ts`

- [ ] **Step 1: Créer le module**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

type ProductInput = {
    id: string;
    name: string;
    price: number;
    ean: string | null;
    canonical_name: string | null;
    brand: string | null;
};

type CategorizedProduct = {
    id: string;
    category_slug: string;
    subcategory_slug: string | null;
    brand: string | null;
    color: string | null;
    gender: "homme" | "femme" | "mixte" | "enfant" | null;
    tags: string[];
    confidence: number;
};

export async function categorizeProducts(
    products: ProductInput[],
    categoryTree: { slug: string; label: string; parent_slug: string | null }[],
): Promise<CategorizedProduct[]> {
    if (products.length === 0) return [];

    // Build category context for the prompt
    const treeText = categoryTree
        .filter((c) => !c.parent_slug) // Level 1 only for the overview
        .map((cat) => {
            const subs = categoryTree
                .filter((c) => c.parent_slug === cat.slug)
                .map((c) => c.label)
                .join(", ");
            return `- ${cat.slug} (${cat.label}): ${subs || "pas de sous-catégories"}`;
        })
        .join("\n");

    const productLines = products
        .map((p) => {
            const parts = [p.name];
            if (p.canonical_name && p.canonical_name !== p.name) parts.push(`(${p.canonical_name})`);
            if (p.brand) parts.push(`[marque: ${p.brand}]`);
            parts.push(`${p.price}€`);
            return `${p.id}|${parts.join(" ")}`;
        })
        .join("\n");

    const subcategoryLines = categoryTree
        .filter((c) => c.parent_slug)
        .map((c) => `  ${c.parent_slug} > ${c.slug} (${c.label})`)
        .join("\n");

    const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [
            {
                role: "user",
                content: `Tu es un expert en catégorisation de produits de commerce de détail français.

CATÉGORIES NIVEAU 1 :
${treeText}

SOUS-CATÉGORIES :
${subcategoryLines}

PRODUITS À CATÉGORISER (format: id|nom [marque] prix) :
${productLines}

Pour chaque produit, retourne un JSON array. Chaque élément :
{
  "id": "uuid du produit",
  "category_slug": "slug de la catégorie niveau 1",
  "subcategory_slug": "slug de la sous-catégorie (ou null)",
  "brand": "marque détectée (ou null)",
  "color": "couleur principale détectée (ou null)",
  "gender": "homme|femme|mixte|enfant (ou null)",
  "tags": ["tag1", "tag2"],
  "confidence": 0-100
}

Règles :
- category_slug DOIT être un slug valide de la liste ci-dessus
- subcategory_slug DOIT être un slug valide OU null
- confidence = 95+ si le nom est explicite, 70-94 si deviné, <70 si incertain
- tags = mots-clés utiles pour la recherche (matière, style, usage...)
- Retourne UNIQUEMENT le JSON array, rien d'autre`,
            },
        ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    try {
        // Extract JSON from response (might be wrapped in markdown code block)
        const jsonStr = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
        const results: CategorizedProduct[] = JSON.parse(jsonStr);
        return results;
    } catch {
        console.error("[categorize] Failed to parse AI response:", text.slice(0, 200));
        return [];
    }
}

/**
 * Full pipeline: categorize all products for a merchant + update DB + set merchant category
 */
export async function categorizeMerchantProducts(merchantId: string): Promise<{
    categorized: number;
    failed: number;
}> {
    const supabase = createAdminClient();

    // 1. Fetch products without category
    const { data: products } = await supabase
        .from("products")
        .select("id, name, price, ean, canonical_name")
        .eq("merchant_id", merchantId)
        .is("category_id", null)
        .limit(200);

    if (!products || products.length === 0) return { categorized: 0, failed: 0 };

    // 2. Get brand info from existing canonical names
    const enrichedProducts: ProductInput[] = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        ean: p.ean,
        canonical_name: p.canonical_name,
        brand: null, // Will be filled from canonical_name pattern if available
    }));

    // 3. Fetch category tree
    const { data: tree } = await supabase.rpc("get_categories_tree");
    if (!tree || tree.length === 0) return { categorized: 0, failed: 0 };

    // 4. Call AI
    const results = await categorizeProducts(enrichedProducts, tree);

    // 5. Update products and insert tags
    let categorized = 0;
    let failed = 0;

    for (const result of results) {
        try {
            // Find category IDs from slugs
            const cat = tree.find((c: any) => c.slug === result.category_slug);
            const subcat = result.subcategory_slug
                ? tree.find((c: any) => c.slug === result.subcategory_slug)
                : null;

            if (!cat) {
                failed++;
                continue;
            }

            // Update product
            await supabase
                .from("products")
                .update({
                    category_id: cat.id,
                    subcategory_id: subcat?.id ?? null,
                    ai_categorized_at: new Date().toISOString(),
                    ai_confidence: result.confidence,
                })
                .eq("id", result.id);

            // Insert tags
            const tags: { product_id: string; tag_type: string; tag_value: string; source: string; confidence: number }[] = [];

            if (result.brand) tags.push({ product_id: result.id, tag_type: "brand", tag_value: result.brand, source: "ai", confidence: result.confidence });
            if (result.color) tags.push({ product_id: result.id, tag_type: "color", tag_value: result.color, source: "ai", confidence: result.confidence });
            if (result.gender) tags.push({ product_id: result.id, tag_type: "gender", tag_value: result.gender, source: "ai", confidence: result.confidence });
            for (const tag of result.tags) {
                tags.push({ product_id: result.id, tag_type: "custom", tag_value: tag, source: "ai", confidence: result.confidence });
            }

            if (tags.length > 0) {
                await supabase.from("product_tags").upsert(tags, { onConflict: "product_id,tag_type,tag_value" });
            }

            categorized++;
        } catch {
            failed++;
        }
    }

    // 6. Set merchant primary category (most frequent among products)
    const { data: catCounts } = await supabase
        .from("products")
        .select("category_id")
        .eq("merchant_id", merchantId)
        .not("category_id", "is", null);

    if (catCounts && catCounts.length > 0) {
        const counts = new Map<string, number>();
        for (const p of catCounts) {
            counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
        }
        const topCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (topCategory) {
            await supabase.from("merchants").update({ primary_category_id: topCategory }).eq("id", merchantId);
        }
    }

    return { categorized, failed };
}
```

- [ ] **Step 2: Vérifier le build**

Run: `cd twostep-nextjs && npm run build 2>&1 | tail -20`

Note: Il faudra installer `@anthropic-ai/sdk` si pas déjà présent :
```bash
npm install @anthropic-ai/sdk
```

Et ajouter `ANTHROPIC_API_KEY` dans `.env.local`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/categorize.ts package.json package-lock.json
git commit -m "feat(Phase3): add AI auto-categorization pipeline (Claude Haiku batch)"
```

---

### Task 5: API route — Catégorisation

**Files:**
- Create: `src/app/api/categorize/route.ts`
- Modify: `src/lib/pos/sync-engine.ts`

- [ ] **Step 1: Créer l'API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { categorizeMerchantProducts } from "@/lib/ai/categorize";
import { captureError } from "@/lib/error";

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

        const result = await categorizeMerchantProducts(merchant.id);
        return NextResponse.json(result);
    } catch (err) {
        captureError(err, { route: "categorize" });
        return NextResponse.json({ error: "Categorization failed" }, { status: 500 });
    }
}
```

- [ ] **Step 2: Intégrer dans le sync engine**

Dans `src/lib/pos/sync-engine.ts`, à la fin de la fonction `syncMerchantPOS` (après `enrichNewProducts` et `pushInventoryToGoogle`), ajouter :

```typescript
import { categorizeMerchantProducts } from "@/lib/ai/categorize";

// ... at the end of syncMerchantPOS, before the return:

// Auto-categorize new products via AI
try {
    await categorizeMerchantProducts(merchantId);
} catch (err) {
    captureError(err, { context: "auto-categorize", merchantId });
    // Non-blocking: categorization failure shouldn't break sync
}
```

- [ ] **Step 3: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/api/categorize/route.ts src/lib/pos/sync-engine.ts
git commit -m "feat(Phase3): add /api/categorize route + integrate in POS sync"
```

---

## BLOC C — Frontend consumer (Tasks 6-9)

### Task 6: Hook useCategories

**Files:**
- Create: `src/hooks/use-categories.ts`

- [ ] **Step 1: Créer le hook**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type Category = {
    id: string;
    slug: string;
    label: string;
    emoji: string | null;
    parent_id: string | null;
    parent_slug: string | null;
    sort_order: number;
};

export type CategoryTree = {
    roots: Category[];
    children: Map<string, Category[]>;
};

export function useCategories() {
    return useQuery<CategoryTree>({
        queryKey: ["categories"],
        queryFn: async () => {
            const supabase = createClient();
            const { data, error } = await supabase.rpc("get_categories_tree");
            if (error || !data) return { roots: [], children: new Map() };

            const roots: Category[] = [];
            const children = new Map<string, Category[]>();

            for (const cat of data as Category[]) {
                if (!cat.parent_id) {
                    roots.push(cat);
                } else {
                    const parentSlug = cat.parent_slug ?? "";
                    if (!children.has(parentSlug)) children.set(parentSlug, []);
                    children.get(parentSlug)!.push(cat);
                }
            }

            return { roots, children };
        },
        staleTime: 10 * 60_000, // 10 min cache
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-categories.ts
git commit -m "feat(Phase3): add useCategories hook (loads tree from Supabase)"
```

---

### Task 7: CategoryPills + CategoryDrawer

**Files:**
- Create: `src/app/(consumer)/components/category-pills.tsx`
- Create: `src/app/(consumer)/components/category-drawer.tsx`

- [ ] **Step 1: Créer category-pills.tsx**

```typescript
"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { cx } from "@/utils/cx";
import { useCategories } from "@/hooks/use-categories";
import { CategoryDrawer } from "./category-drawer";

interface CategoryPillsProps {
    activeCategory: string | null;
    onCategoryChange: (slug: string | null) => void;
    maxVisible?: number;
}

export function CategoryPills({ activeCategory, onCategoryChange, maxVisible = 6 }: CategoryPillsProps) {
    const { data: tree } = useCategories();
    const [drawerOpen, setDrawerOpen] = useState(false);

    const roots = tree?.roots ?? [];
    const visibleRoots = roots.slice(0, maxVisible);

    return (
        <>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                {/* "Tout" pill */}
                <button
                    type="button"
                    onClick={() => onCategoryChange(null)}
                    className={cx(
                        "flex shrink-0 items-center rounded-full px-3 py-1 text-[11px] font-semibold transition duration-100 ease-linear",
                        activeCategory === null
                            ? "bg-[var(--ts-accent)] text-white shadow-sm"
                            : "bg-[var(--ts-bg-input)] text-[var(--ts-text)]/60",
                    )}
                >
                    Tout
                </button>

                {/* Category pills */}
                {visibleRoots.map((cat) => (
                    <button
                        key={cat.slug}
                        type="button"
                        onClick={() => onCategoryChange(activeCategory === cat.slug ? null : cat.slug)}
                        className={cx(
                            "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition duration-100 ease-linear",
                            activeCategory === cat.slug
                                ? "bg-[var(--ts-accent)] text-white shadow-sm"
                                : "bg-[var(--ts-bg-input)] text-[var(--ts-text)]/60",
                        )}
                    >
                        {cat.emoji && <span className="text-[11px]">{cat.emoji}</span>}
                        {cat.label}
                    </button>
                ))}

                {/* "Tout ▾" button */}
                {roots.length > maxVisible && (
                    <button
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        className="flex shrink-0 items-center rounded-full border-[1.5px] border-[var(--ts-accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ts-accent)] transition duration-100 ease-linear"
                    >
                        Tout ▾
                    </button>
                )}
            </div>

            <CategoryDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                activeCategory={activeCategory}
                onCategoryChange={(slug) => {
                    onCategoryChange(slug);
                    setDrawerOpen(false);
                }}
            />
        </>
    );
}
```

- [ ] **Step 2: Créer category-drawer.tsx**

```typescript
"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { motion, AnimatePresence } from "motion/react";
import { cx } from "@/utils/cx";
import { useCategories } from "@/hooks/use-categories";

interface CategoryDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeCategory: string | null;
    onCategoryChange: (slug: string | null) => void;
}

export function CategoryDrawer({ open, onOpenChange, activeCategory, onCategoryChange }: CategoryDrawerProps) {
    const { data: tree } = useCategories();
    const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

    const roots = tree?.roots ?? [];
    const children = tree?.children ?? new Map();

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
                <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] rounded-t-2xl bg-white">
                    <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-300" />
                    <div className="px-5 pb-6 pt-4">
                        <Drawer.Title className="font-heading text-[17px] font-bold text-[var(--ts-text)]">
                            Toutes les catégories
                        </Drawer.Title>

                        <div className="mt-4 flex flex-col overflow-y-auto" style={{ maxHeight: "70vh" }}>
                            {/* "Tout" option */}
                            <button
                                type="button"
                                onClick={() => onCategoryChange(null)}
                                className={cx(
                                    "flex items-center gap-3 rounded-lg px-3 py-3 text-left text-[14px] font-medium transition duration-100",
                                    activeCategory === null
                                        ? "bg-[var(--ts-accent)]/10 text-[var(--ts-accent)]"
                                        : "text-[var(--ts-text)]",
                                )}
                            >
                                Toutes les catégories
                            </button>

                            {roots.map((cat) => {
                                const subs = children.get(cat.slug) ?? [];
                                const isExpanded = expandedSlug === cat.slug;
                                const isActive = activeCategory === cat.slug;

                                return (
                                    <div key={cat.slug}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (subs.length > 0) {
                                                    setExpandedSlug(isExpanded ? null : cat.slug);
                                                } else {
                                                    onCategoryChange(cat.slug);
                                                }
                                            }}
                                            className={cx(
                                                "flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition duration-100",
                                                isActive
                                                    ? "bg-[var(--ts-accent)]/10 text-[var(--ts-accent)]"
                                                    : "text-[var(--ts-text)]",
                                            )}
                                        >
                                            <span className="flex items-center gap-2.5 text-[14px] font-medium">
                                                {cat.emoji && <span className="text-[16px]">{cat.emoji}</span>}
                                                {cat.label}
                                            </span>
                                            {subs.length > 0 && (
                                                <span className={cx(
                                                    "text-[12px] text-[var(--ts-text-secondary)] transition-transform duration-200",
                                                    isExpanded && "rotate-90",
                                                )}>
                                                    ›
                                                </span>
                                            )}
                                        </button>

                                        <AnimatePresence>
                                            {isExpanded && subs.length > 0 && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-1">
                                                        {/* Select parent category (all subcategories) */}
                                                        <button
                                                            type="button"
                                                            onClick={() => onCategoryChange(cat.slug)}
                                                            className={cx(
                                                                "rounded-full px-3 py-1.5 text-[11px] font-medium transition duration-100",
                                                                activeCategory === cat.slug
                                                                    ? "bg-[var(--ts-accent)] text-white"
                                                                    : "bg-[var(--ts-bg-input)] text-[var(--ts-text)]/60",
                                                            )}
                                                        >
                                                            Tout {cat.label}
                                                        </button>
                                                        {subs.map((sub) => (
                                                            <button
                                                                key={sub.slug}
                                                                type="button"
                                                                onClick={() => onCategoryChange(sub.slug)}
                                                                className={cx(
                                                                    "rounded-full px-3 py-1.5 text-[11px] font-medium transition duration-100",
                                                                    activeCategory === sub.slug
                                                                        ? "bg-[var(--ts-accent)] text-white"
                                                                        : "bg-[var(--ts-bg-input)] text-[var(--ts-text)]/60",
                                                                )}
                                                            >
                                                                {sub.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}
```

- [ ] **Step 3: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/\(consumer\)/components/category-pills.tsx src/app/\(consumer\)/components/category-drawer.tsx
git commit -m "feat(Phase3): add CategoryPills + CategoryDrawer (dynamic from DB)"
```

---

### Task 8: Intégrer CategoryPills dans les pages consumer

**Files:**
- Modify: `src/app/(consumer)/discover/page.tsx` — remplacer les pills CONSUMER_CATEGORIES par `<CategoryPills>`
- Modify: `src/app/(consumer)/explore/page.tsx` — idem
- Modify: `src/app/(consumer)/search/page.tsx` — idem
- Modify: `src/lib/categories.ts` — supprimer `CONSUMER_CATEGORIES`, garder `CATEGORY_SEO`

- [ ] **Step 1: Mettre à jour discover/page.tsx**

Remplacer l'import `CONSUMER_CATEGORIES` et le bloc de pills hardcodé par :

```typescript
import { CategoryPills } from "../components/category-pills";
```

Supprimer le bloc JSX des pills manuels (le `{CONSUMER_CATEGORIES.map((cat) => ...)}`) et le remplacer par :

```tsx
<CategoryPills
    activeCategory={activeCategory}
    onCategoryChange={setActiveCategory}
/>
```

- [ ] **Step 2: Mettre à jour explore/page.tsx**

Même remplacement — importer `CategoryPills` et remplacer le bloc pills hardcodé.

- [ ] **Step 3: Mettre à jour search/page.tsx**

Même remplacement.

- [ ] **Step 4: Nettoyer lib/categories.ts**

Supprimer `CONSUMER_CATEGORIES` et `CategoryValue`. Garder `CATEGORY_SEO` (utilisé par les pages SEO toulouse/[category] et [city]/[category]).

```typescript
// Supprimer:
export const CONSUMER_CATEGORIES = [...];
export type CategoryValue = ...;

// Garder:
export const CATEGORY_SEO = { ... };
```

- [ ] **Step 5: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/app/\(consumer\)/discover/page.tsx src/app/\(consumer\)/explore/page.tsx src/app/\(consumer\)/search/page.tsx src/lib/categories.ts
git commit -m "feat(Phase3): replace hardcoded categories with dynamic CategoryPills"
```

---

### Task 9: FilterPanel — Panneau de filtres contextuels

**Files:**
- Create: `src/app/(consumer)/components/filter-panel.tsx`
- Create: `src/hooks/use-filter-values.ts`

- [ ] **Step 1: Créer le hook use-filter-values.ts**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

type FilterValue = { tag_type: string; tag_value: string; count: number };

export function useFilterValues(categorySlug: string | null, lat: number, lng: number) {
    return useQuery<FilterValue[]>({
        queryKey: ["filter-values", categorySlug, lat, lng],
        queryFn: async () => {
            if (!categorySlug) return [];
            const supabase = createClient();
            const { data, error } = await supabase.rpc("get_filter_values", {
                p_category_slug: categorySlug,
                p_lat: lat,
                p_lng: lng,
                p_radius_km: 10,
            });
            if (error || !data) return [];
            return data as FilterValue[];
        },
        staleTime: 30_000,
        enabled: !!categorySlug,
    });
}
```

- [ ] **Step 2: Créer filter-panel.tsx**

```typescript
"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { FilterLines } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { useFilterValues } from "@/hooks/use-filter-values";

interface Filters {
    brand: string | null;
    color: string | null;
    gender: string | null;
    priceMin: number | null;
    priceMax: number | null;
}

interface FilterPanelProps {
    categorySlug: string | null;
    lat: number;
    lng: number;
    filters: Filters;
    onFiltersChange: (filters: Filters) => void;
}

const COLOR_MAP: Record<string, string> = {
    blanc: "#ffffff",
    noir: "#1a1a1a",
    rouge: "#dc2626",
    bleu: "#2563eb",
    vert: "#16a34a",
    jaune: "#eab308",
    rose: "#ec4899",
    gris: "#6b7280",
    marron: "#92400e",
    orange: "#ea580c",
    violet: "#7c3aed",
    beige: "#d4c5a9",
};

export function FilterPanel({ categorySlug, lat, lng, filters, onFiltersChange }: FilterPanelProps) {
    const [open, setOpen] = useState(false);
    const { data: filterValues } = useFilterValues(categorySlug, lat, lng);

    const brands = (filterValues ?? []).filter((f) => f.tag_type === "brand");
    const colors = (filterValues ?? []).filter((f) => f.tag_type === "color");
    const genders = (filterValues ?? []).filter((f) => f.tag_type === "gender");

    const hasActiveFilters = filters.brand || filters.color || filters.gender || filters.priceMin || filters.priceMax;
    const hasFilters = brands.length > 0 || colors.length > 0 || genders.length > 0;

    if (!categorySlug || !hasFilters) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cx(
                    "relative flex shrink-0 items-center justify-center rounded-full transition duration-100",
                    hasActiveFilters
                        ? "bg-[var(--ts-accent)] text-white shadow-sm"
                        : "bg-[var(--ts-bg-input)] text-[var(--ts-text)]/60",
                    "size-7",
                )}
                aria-label="Filtres"
            >
                <FilterLines className="size-3.5" />
                {hasActiveFilters && (
                    <span className="absolute -right-0.5 -top-0.5 flex size-3 items-center justify-center rounded-full bg-[var(--ts-accent)] text-[7px] text-white ring-2 ring-white">
                        !
                    </span>
                )}
            </button>

            <Drawer.Root open={open} onOpenChange={setOpen}>
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
                    <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] rounded-t-2xl bg-white">
                        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-300" />
                        <div className="px-5 pb-6 pt-4">
                            <div className="flex items-center justify-between">
                                <Drawer.Title className="font-heading text-[17px] font-bold text-[var(--ts-text)]">
                                    Filtres
                                </Drawer.Title>
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={() => onFiltersChange({ brand: null, color: null, gender: null, priceMin: null, priceMax: null })}
                                        className="text-xs font-semibold text-[var(--ts-accent)]"
                                    >
                                        Réinitialiser
                                    </button>
                                )}
                            </div>

                            <div className="mt-4 flex flex-col gap-5 overflow-y-auto" style={{ maxHeight: "60vh" }}>
                                {/* Brands */}
                                {brands.length > 0 && (
                                    <div>
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ts-text-secondary)]">Marque</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {brands.slice(0, 20).map((b) => (
                                                <button
                                                    key={b.tag_value}
                                                    type="button"
                                                    onClick={() => onFiltersChange({ ...filters, brand: filters.brand === b.tag_value ? null : b.tag_value })}
                                                    className={cx(
                                                        "rounded-full px-3 py-1.5 text-[11px] font-medium transition duration-100",
                                                        filters.brand === b.tag_value
                                                            ? "bg-[var(--ts-accent)] text-white"
                                                            : "bg-[var(--ts-bg-input)] text-[var(--ts-text)]/60",
                                                    )}
                                                >
                                                    {b.tag_value} ({b.count})
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Colors */}
                                {colors.length > 0 && (
                                    <div>
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ts-text-secondary)]">Couleur</p>
                                        <div className="flex gap-2">
                                            {colors.map((c) => (
                                                <button
                                                    key={c.tag_value}
                                                    type="button"
                                                    onClick={() => onFiltersChange({ ...filters, color: filters.color === c.tag_value ? null : c.tag_value })}
                                                    className={cx(
                                                        "size-7 rounded-full border-2 transition duration-100",
                                                        filters.color === c.tag_value
                                                            ? "border-[var(--ts-accent)] ring-2 ring-[var(--ts-accent)]/30"
                                                            : "border-transparent",
                                                    )}
                                                    style={{ backgroundColor: COLOR_MAP[c.tag_value.toLowerCase()] ?? "#e5e7eb" }}
                                                    aria-label={c.tag_value}
                                                    title={`${c.tag_value} (${c.count})`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Gender */}
                                {genders.length > 0 && (
                                    <div>
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ts-text-secondary)]">Genre</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {genders.map((g) => (
                                                <button
                                                    key={g.tag_value}
                                                    type="button"
                                                    onClick={() => onFiltersChange({ ...filters, gender: filters.gender === g.tag_value ? null : g.tag_value })}
                                                    className={cx(
                                                        "rounded-full px-3 py-1.5 text-[11px] font-medium transition duration-100",
                                                        filters.gender === g.tag_value
                                                            ? "bg-[var(--ts-accent)] text-white"
                                                            : "bg-[var(--ts-bg-input)] text-[var(--ts-text)]/60",
                                                    )}
                                                >
                                                    {g.tag_value} ({g.count})
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Price range */}
                                <div>
                                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ts-text-secondary)]">Prix</p>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            placeholder="Min €"
                                            value={filters.priceMin ?? ""}
                                            onChange={(e) => onFiltersChange({ ...filters, priceMin: e.target.value ? Number(e.target.value) : null })}
                                            className="flex-1 rounded-lg border border-[var(--ts-border)] bg-[var(--ts-bg)] px-3 py-2 text-xs text-[var(--ts-text)] placeholder:text-[var(--ts-text-secondary)]/40"
                                        />
                                        <span className="text-xs text-[var(--ts-text-secondary)]">—</span>
                                        <input
                                            type="number"
                                            placeholder="Max €"
                                            value={filters.priceMax ?? ""}
                                            onChange={(e) => onFiltersChange({ ...filters, priceMax: e.target.value ? Number(e.target.value) : null })}
                                            className="flex-1 rounded-lg border border-[var(--ts-border)] bg-[var(--ts-bg)] px-3 py-2 text-xs text-[var(--ts-text)] placeholder:text-[var(--ts-text-secondary)]/40"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="mt-4 w-full rounded-xl bg-[var(--ts-accent)] py-3 text-[13px] font-semibold text-white transition duration-100 active:opacity-90"
                            >
                                Voir les résultats
                            </button>
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        </>
    );
}
```

- [ ] **Step 3: Vérifier le build et commit**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -20
git add src/hooks/use-filter-values.ts src/app/\(consumer\)/components/filter-panel.tsx
git commit -m "feat(Phase3): add FilterPanel with brand/color/gender/price (Vinted-style)"
```

---

### Task 10: Build final + nettoyage

**Files:**
- Verify all modified files

- [ ] **Step 1: Build complet**

```bash
cd twostep-nextjs && npm run build 2>&1 | tail -30
```

- [ ] **Step 2: Vérifier les orphelins**

```bash
grep -r "CONSUMER_CATEGORIES" src/ --include="*.tsx" --include="*.ts" -l
```

Expected: zéro résultats (sauf si CATEGORY_SEO est dans lib/categories.ts, ce qui est correct).

- [ ] **Step 3: Commit final si nettoyage nécessaire**

```bash
git add -A
git commit -m "chore(Phase3): final cleanup and build verification"
```

---

## Résumé des commits

| # | Bloc | Message | Scope |
|---|------|---------|-------|
| 1 | DB | `feat(Phase3): add categories table with 15 L1 + ~80 L2 seed data` | Migration + seed |
| 2 | DB | `feat(Phase3): add product_tags table + category columns + filter RPC` | Migration |
| 3 | DB | `feat(Phase3): add category_corrections table` | Migration |
| 4 | IA | `feat(Phase3): add AI auto-categorization pipeline (Claude Haiku batch)` | Core module |
| 5 | IA | `feat(Phase3): add /api/categorize route + integrate in POS sync` | API + sync |
| 6 | FE | `feat(Phase3): add useCategories hook (loads tree from Supabase)` | Hook |
| 7 | FE | `feat(Phase3): add CategoryPills + CategoryDrawer (dynamic from DB)` | Composants |
| 8 | FE | `feat(Phase3): replace hardcoded categories with dynamic CategoryPills` | 4 pages |
| 9 | FE | `feat(Phase3): add FilterPanel with brand/color/gender/price (Vinted-style)` | Composant + hook |
| 10 | — | `chore(Phase3): final cleanup and build verification` | Vérification |

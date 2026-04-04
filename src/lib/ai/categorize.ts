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

    const treeText = categoryTree
        .filter((c) => !c.parent_slug)
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
        const jsonStr = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
        const results: CategorizedProduct[] = JSON.parse(jsonStr);
        return results;
    } catch {
        console.error("[categorize] Failed to parse AI response:", text.slice(0, 200));
        return [];
    }
}

export async function categorizeMerchantProducts(merchantId: string): Promise<{
    categorized: number;
    failed: number;
}> {
    const supabase = createAdminClient();

    const { data: products } = await supabase
        .from("products")
        .select("id, name, price, ean, canonical_name")
        .eq("merchant_id", merchantId)
        .is("category_id", null)
        .limit(200);

    if (!products || products.length === 0) return { categorized: 0, failed: 0 };

    const enrichedProducts: ProductInput[] = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        ean: p.ean,
        canonical_name: p.canonical_name,
        brand: null,
    }));

    const { data: tree } = await supabase.rpc("get_categories_tree");
    if (!tree || tree.length === 0) return { categorized: 0, failed: 0 };

    let results: CategorizedProduct[] = [];
    try {
        results = await categorizeProducts(enrichedProducts, tree);
    } catch (err) {
        console.error("[categorize] AI call failed:", err);
        return { categorized: 0, failed: products.length };
    }

    let categorized = 0;
    let failed = 0;

    for (const result of results) {
        try {
            const cat = tree.find((c: any) => c.slug === result.category_slug);
            const subcat = result.subcategory_slug
                ? tree.find((c: any) => c.slug === result.subcategory_slug)
                : null;

            if (!cat) { failed++; continue; }

            await supabase
                .from("products")
                .update({
                    category_id: cat.id,
                    category: cat.slug.toLowerCase(),
                    subcategory_id: subcat?.id ?? null,
                    ai_categorized_at: new Date().toISOString(),
                    ai_confidence: result.confidence,
                })
                .eq("id", result.id);

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
        } catch { failed++; }
    }

    // Set merchant primary category based on most frequent category
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

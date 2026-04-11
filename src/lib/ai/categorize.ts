import { createAdminClient } from "@/lib/supabase/admin";

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
    secondary_categories?: string[];
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

    const prompt = `Tu es un expert en catégorisation de produits de commerce de détail français.

CATÉGORIES NIVEAU 1 :
${treeText}

SOUS-CATÉGORIES :
${subcategoryLines}

PRODUITS À CATÉGORISER (format: id|nom [marque] prix) :
${productLines}

Pour chaque produit, retourne un JSON array. Chaque élément :
{
  "id": "uuid du produit",
  "category_slug": "slug de la catégorie PRINCIPALE niveau 1",
  "subcategory_slug": "slug de la sous-catégorie (ou null)",
  "secondary_categories": ["slug1", "slug2"],
  "brand": "marque détectée (ou null)",
  "color": "couleur principale détectée (ou null)",
  "gender": "homme|femme|mixte|enfant (ou null)",
  "tags": ["tag1", "tag2"],
  "confidence": 0-100
}

Règles :
- category_slug DOIT être un slug valide de la liste ci-dessus
- subcategory_slug DOIT être un slug valide OU null
- secondary_categories = catégories SUPPLÉMENTAIRES où le produit devrait aussi apparaître (slugs niveau 1 valides). Exemples :
  * Nike Dunk Low → catégorie principale "chaussures", secondaires ["mode", "sport-outdoor"]
  * Veste en jean → catégorie principale "mode", secondaires []
  * Chaussures de running → catégorie principale "chaussures", secondaires ["sport-outdoor"]
  * Lunettes de soleil sport → catégorie principale "bijoux-accessoires", secondaires ["sport-outdoor"]
- confidence = 95+ si le nom est explicite, 70-94 si deviné, <70 si incertain
- tags = mots-clés utiles pour la recherche (matière, style, usage...)
- Retourne UNIQUEMENT le JSON array, rien d'autre`;

    // Try Groq first (free, 14k req/day), fall back to Gemini
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    let text = "";

    if (groqKey) {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                max_tokens: 4096,
            }),
        });

        if (!response.ok) {
            console.warn("[categorize] Groq failed:", response.status, "— trying Gemini");
        } else {
            const data = await response.json();
            text = data.choices?.[0]?.message?.content ?? "";
        }
    }

    if (!text && geminiKey) {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
                }),
            },
        );

        if (response.ok) {
            const data = await response.json();
            text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        }
    }

    if (!text) throw new Error("No AI provider available for categorization (GROQ_API_KEY and GEMINI_API_KEY both failed)");

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

            // Secondary categories — product appears in multiple category filters
            if (result.secondary_categories) {
                for (const secSlug of result.secondary_categories) {
                    const secCat = tree.find((c: any) => c.slug === secSlug);
                    if (secCat) {
                        tags.push({ product_id: result.id, tag_type: "category", tag_value: secSlug, source: "ai", confidence: result.confidence });
                    }
                }
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

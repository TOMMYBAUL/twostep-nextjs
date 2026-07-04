import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedTaxonomy, cacheTaxonomy } from "@/lib/enrichment/cache-taxonomy";
import { captureError } from "@/lib/error";
import { chunk } from "@/lib/ingest/reconcile";

// En dessous de ce seuil, la catégorie IA est jugée trop incertaine pour être
// appliquée (le prompt calibre : 95+ explicite, 70-94 deviné, <70 incertain).
const CATEGORY_CONFIDENCE_MIN = 70;

/**
 * Taille de LOT par appel IA (P0-9, 2026-07-04). Avant : jusqu'à 200 produits dans
 * UN appel avec max_tokens 4096 → la réponse JSON (~80 tokens/produit) était TRONQUÉE
 * dès ~50 produits → parse en échec → `failed` sans poser `ai_categorized_at` → les
 * MÊMES produits repartaient au cron suivant (toutes les 5 min via enrich-products) → tokens
 * re-brûlés en boucle infinie pour tout marchand > ~50 produits. À 30 produits/appel,
 * la réponse tient largement (~2 400 tokens < 4 096), et un échec résiduel ne coûte
 * que son lot (marqué, cf. CategorizeParseError).
 */
export const AI_CATEGORIZE_BATCH_SIZE = 30;

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

    return parseCategorizationResponse(text);
}

/**
 * Parse la réponse de catégorisation du LLM (tolère les fences ```json).
 *
 * LÈVE sur réponse non-JSON OU non-tableau — au lieu de l'ancien `return []`
 * silencieux. Deux raisons :
 *  1. `return []` masquait l'échec : le caller comptait `failed=0` alors que N
 *     produits n'étaient pas catégorisés, et — `ai_categorized_at` restant null —
 *     les RE-tentait à CHAQUE run en brûlant des tokens IA, indéfiniment et sans
 *     trace (dérive/coût caché). En levant, le `catch` du caller les compte en
 *     `failed` et logue (visible).
 *  2. Un JSON valide mais non-tableau (ex. `{"error": ...}`) passait l'ancien
 *     `JSON.parse` puis faisait planter le `for...of` du caller (hors try/catch)
 *     → TypeError NON catchée qui crashait toute la route. Le garde Array.isArray
 *     le transforme en échec catché et compté.
 */
export function parseCategorizationResponse(raw: string): CategorizedProduct[] {
    const jsonStr = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        throw new CategorizeParseError(`categorize: réponse IA non-JSON: ${raw.slice(0, 200)}`);
    }
    if (!Array.isArray(parsed)) {
        throw new CategorizeParseError(`categorize: réponse IA non-tableau: ${raw.slice(0, 200)}`);
    }
    return parsed as CategorizedProduct[];
}

/**
 * Échec de PARSING d'une réponse IA (JSON tronqué/invalide/non-tableau) — à
 * distinguer d'un échec de DISPONIBILITÉ (aucun provider). Discriminateur P0-9 :
 *  - parse en échec = des tokens ONT été consommés et la même entrée reproduira
 *    très probablement le même échec (température 0.1) → on MARQUE le lot
 *    (`ai_categorized_at`) pour casser la boucle de re-brûlage du cron 5-min ;
 *  - provider indisponible = AUCUN token consommé (clé absente / HTTP !ok) → on
 *    ne marque PAS (le retry au run suivant est gratuit côté tokens et la
 *    catégorisation légitime n'est pas perdue sur un blip).
 */
export class CategorizeParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CategorizeParseError";
    }
}

type TagInsert = { product_id: string; tag_type: string; tag_value: string; source: string; confidence: number };

export async function categorizeMerchantProducts(merchantId: string): Promise<{
    categorized: number;
    failed: number;
    low_confidence: number;
}> {
    const supabase = createAdminClient();

    // Sélection sur ai_categorized_at null (pas category_id) : un produit déjà
    // tenté — succès OU rejet sous seuil de confiance — n'est pas re-catégorisé
    // en boucle (le rejet sous seuil laisse category_id null mais marque la tentative).
    const { data: products } = await supabase
        .from("products")
        .select("id, name, price, ean, canonical_name")
        .eq("merchant_id", merchantId)
        .is("ai_categorized_at", null)
        .limit(200);

    if (!products || products.length === 0) return { categorized: 0, failed: 0, low_confidence: 0 };

    const { data: tree } = await supabase.rpc("get_categories_tree");
    if (!tree || tree.length === 0) return { categorized: 0, failed: 0, low_confidence: 0 };

    // ─── Phase 1: cache lookup for products with EAN ───
    const cacheHits: Array<{ product: typeof products[number]; cached: NonNullable<Awaited<ReturnType<typeof getCachedTaxonomy>>> }> = [];
    const needAI: ProductInput[] = [];

    for (const p of products) {
        if (p.ean) {
            const cached = await getCachedTaxonomy(p.ean);
            if (cached && cached.category_id) {
                cacheHits.push({ product: p, cached });
                continue;
            }
        }
        needAI.push({
            id: p.id,
            name: p.name,
            price: p.price,
            ean: p.ean,
            canonical_name: p.canonical_name,
            brand: null,
        });
    }

    let categorized = 0;
    let failed = 0;
    let lowConfidence = 0;

    // ─── Phase 2: apply cached taxonomies (no AI cost) ───
    for (const hit of cacheHits) {
        try {
            const cat = tree.find((c: any) => c.slug === hit.cached.category_id);
            const subcat = hit.cached.subcategory_id
                ? tree.find((c: any) => c.slug === hit.cached.subcategory_id)
                : null;

            if (!cat) { failed++; continue; }

            await supabase
                .from("products")
                .update({
                    category_id: cat.id,
                    category: cat.slug.toLowerCase(),
                    subcategory_id: subcat?.id ?? null,
                    ai_categorized_at: new Date().toISOString(),
                    ai_confidence: 100, // cache hit = previously validated by AI on another merchant
                })
                .eq("id", hit.product.id);

            const tags: TagInsert[] = [];
            if (hit.cached.gender) tags.push({ product_id: hit.product.id, tag_type: "gender", tag_value: hit.cached.gender, source: "cache", confidence: 100 });
            if (hit.cached.color) tags.push({ product_id: hit.product.id, tag_type: "color", tag_value: hit.cached.color, source: "cache", confidence: 100 });
            if (hit.cached.tags) {
                for (const tag of hit.cached.tags) {
                    tags.push({ product_id: hit.product.id, tag_type: "custom", tag_value: tag, source: "cache", confidence: 100 });
                }
            }
            if (tags.length > 0) {
                await supabase.from("product_tags").upsert(tags, { onConflict: "product_id,tag_type,tag_value" });
            }

            categorized++;
        } catch { failed++; }
    }

    // ─── Phase 3: AI for remaining products (par LOTS de 30, cf. AI_CATEGORIZE_BATCH_SIZE)
    //     + cache results. Les résultats d'un lot sont appliqués AVANT le lot suivant :
    //     un échec du lot N ne perd pas la catégorisation des lots 1..N-1. ───
    for (const batch of chunk(needAI, AI_CATEGORIZE_BATCH_SIZE)) {
        let results: CategorizedProduct[] = [];
        try {
            results = await categorizeProducts(batch, tree);
        } catch (err) {
            console.error("[categorize] AI call failed:", err);
            failed += batch.length;

            if (err instanceof CategorizeParseError) {
                // Tokens déjà brûlés + même entrée ⇒ même échec probable : on marque le
                // LOT (ai_categorized_at, confidence 0 = « tentative, rien d'appliqué »)
                // pour que le sélecteur (ai_categorized_at IS NULL) ne le re-présente
                // pas au cron */5 indéfiniment. Aucune catégorie n'est écrite (zéro
                // faux positif) ; un re-run manuel reste possible via l'admin.
                const { error: markErr } = await supabase
                    .from("products")
                    .update({ ai_categorized_at: new Date().toISOString(), ai_confidence: 0 })
                    .in("id", batch.map((p) => p.id));
                if (markErr) {
                    // Marquage raté = la boucle de re-brûlage persiste pour ce lot → visible.
                    captureError(markErr, { module: "categorize", phase: "mark-parse-failure", merchantId });
                }
                captureError(err, { module: "categorize", phase: "ai-parse", merchantId, batchSize: batch.length });
            }
            // Échec de DISPONIBILITÉ (aucun provider / HTTP !ok) : ne PAS marquer —
            // aucun token consommé, le retry du prochain run est légitime.
            continue;
        }

    for (const result of results) {
        try {
            const cat = tree.find((c: any) => c.slug === result.category_slug);
            const subcat = result.subcategory_slug
                ? tree.find((c: any) => c.slug === result.subcategory_slug)
                : null;

            if (!cat) { failed++; continue; }

            // Seuil de confiance : une catégorie devinée trop incertaine (<70) n'est
            // PAS appliquée — mieux vaut "pas de catégorie" qu'une fausse catégorie
            // qui décrédibilise. On marque quand même la tentative (ai_categorized_at)
            // pour ne pas re-boucler sur l'IA indéfiniment. Le produit reste visible
            // (le gate visibilité dépend de l'identité, pas de la catégorie).
            if (result.confidence < CATEGORY_CONFIDENCE_MIN) {
                await supabase
                    .from("products")
                    .update({ ai_categorized_at: new Date().toISOString(), ai_confidence: result.confidence })
                    .eq("id", result.id);
                lowConfidence++;
                continue;
            }

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

            const tags: TagInsert[] = [];
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

            // ─── Phase 4: cache the AI result if we have an EAN ───
            const sourceProduct = needAI.find(p => p.id === result.id);
            if (sourceProduct?.ean) {
                void cacheTaxonomy(sourceProduct.ean, {
                    category_id: cat.slug,
                    subcategory_id: subcat?.slug ?? null,
                    gender: result.gender,
                    color: result.color,
                    tags: result.tags,
                });
            }

            categorized++;
        } catch { failed++; }
    }
    } // fin du lot (chunk AI_CATEGORIZE_BATCH_SIZE)

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

    return { categorized, failed, low_confidence: lowConfidence };
}

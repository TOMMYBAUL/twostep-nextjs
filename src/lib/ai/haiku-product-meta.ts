/**
 * Haiku product meta — Phase 1.2 + 1.3.
 *
 * Pour le wizard cascade-suggest, on a besoin de 2 enrichissements text qui
 * ne sont pas couverts par les Tiers cascade EAN/photo :
 *   1. Catégorie suggestion (slug texte libre, ex "chaussures", "cosmétique")
 *   2. Description qualitative courte (1-2 phrases, marketing-ready)
 *
 * `categorizeProducts` (src/lib/ai/categorize.ts) existe mais est bulk +
 * requiert UUID products + categoryTree DB — overkill pour 1 staging row
 * sans product encore créé. On préfère ici un Haiku court qui prend
 * (name, brand, ean) → JSON {category, description}.
 *
 * Coût : ~0.0004€/call (Haiku). 200 produits Kap pilote = 0.08€.
 *
 * Fail-soft : retourne null des 2 champs si ANTHROPIC_API_KEY absent ou call
 * échoue. Le wizard reste fonctionnel sans IA.
 */

import { captureError } from "@/lib/error";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HTTP_TIMEOUT_MS = 8_000;

export interface ProductMetaInput {
    name: string;
    brand?: string | null;
    ean?: string | null;
}

export interface ProductMetaSuggestion {
    category: string | null;
    description: string | null;
}

/**
 * Demande à Claude Haiku une catégorie + description courte pour un produit.
 *
 * Catégorie : 1-3 mots français usuels (chaussures, cosmétique, accessoires,
 * vin, livre, etc.). Adapte la taxonomie au futur via une normalisation
 * downstream — ici on capture la suggestion brute.
 *
 * Description : 1-2 phrases factuelles destinées au feed consumer/LFP.
 * Pas de superlatifs marketing creux ("incroyable", "exceptionnel"). Évite
 * d'inventer des features absentes des inputs (le marchand corrigera).
 */
export async function suggestProductMeta(
    input: ProductMetaInput,
): Promise<ProductMetaSuggestion> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || !input.name || input.name.trim().length === 0) {
        return { category: null, description: null };
    }

    const productDesc = [
        input.brand ? `Marque : ${input.brand}` : null,
        `Nom : ${input.name}`,
        input.ean ? `EAN : ${input.ean}` : null,
    ]
        .filter(Boolean)
        .join(" · ");

    const prompt = `Produit français à catégoriser et décrire :
${productDesc}

Retourne UNIQUEMENT un JSON valide :
{
  "category": "...",
  "description": "..."
}

Règles :
- category = 1-3 mots minuscules en français (ex : "chaussures", "cosmétique", "vin", "livre", "accessoires", "audio", "informatique")
- description = 1-2 phrases factuelles courtes (max 200 caractères) pour fiche produit. Pas de superlatifs creux. Pas d'invention. Si tu ne sais pas, écris la phrase la plus neutre possible.
- Si tu n'es pas sûr d'un champ, mets null (sans guillemets).`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: HAIKU_MODEL,
                max_tokens: 200,
                messages: [{ role: "user", content: prompt }],
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) return { category: null, description: null };

        const data = (await res.json()) as {
            content?: Array<{ text?: string }>;
        };
        const raw = data.content?.[0]?.text ?? "";

        // Extraire le bloc JSON (Haiku peut ajouter du préambule malgré l'instruction).
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { category: null, description: null };

        const parsed = JSON.parse(jsonMatch[0]) as {
            category?: unknown;
            description?: unknown;
        };

        const category =
            typeof parsed.category === "string" && parsed.category.trim().length > 0
                ? parsed.category.trim().toLowerCase().slice(0, 100)
                : null;
        const description =
            typeof parsed.description === "string" &&
            parsed.description.trim().length > 0
                ? parsed.description.trim().slice(0, 500)
                : null;

        return { category, description };
    } catch (err) {
        clearTimeout(timeout);
        captureError(err, { module: "haiku-product-meta" });
        return { category: null, description: null };
    }
}

/**
 * Tier 3 — Google Product Catalog matching via Serper Shopping (Phase 1.1).
 *
 * Source de vérité : brain `06-Tech/Socle-identification-cascade.md` Tier 3.
 *
 * NOTE STRATÉGIQUE : le brainstorm 24/04 mentionnait "Google Product Catalog
 * via Merchant Center" mais cette API n'expose pas le 45Md+ Shopping graph
 * pour des lookups arbitraires (Merchant Center API ne retourne que les
 * produits du compte authentifié). On passe par **Serper Shopping** qui
 * indexe Google Shopping et fournit les résultats structurés (title, brand,
 * imageUrl, price). Coût borné dans budget Serper existant (~15€/mo).
 *
 * Score si match : 0.95 (`tier3_google_pc` dans score-cascade.ts).
 *
 * Stratégie query :
 *   1. Si EAN fourni → query par EAN exact (le plus précis, Google indexe
 *      souvent les fiches produits avec EAN dans la metadata)
 *   2. Sinon si brand + name → query "{brand} {name}"
 *   3. Sinon si name seul → query "{name}" (rare, peu fiable)
 *
 * Validation match :
 *   - Query par EAN : on accepte le top result si présent (fiabilité Google
 *     élevée sur les EAN connus)
 *   - Query par brand+name : on accepte le top result mais on flag
 *     `confidence: "weak"` pour permettre au caller de décider
 */

const SERPER_SHOPPING_URL = "https://google.serper.dev/shopping";
const HTTP_TIMEOUT_MS = 8_000;

export interface GoogleShoppingMatch {
    canonical_name: string;
    brand: string | null;
    photo_url: string | null;
    price: number | null;
    /** "strong" si query par EAN, "weak" sinon. */
    confidence: "strong" | "weak";
    /** URL produit pour audit / debug. */
    source_url: string | null;
}

interface ShoppingItem {
    title?: string;
    source?: string;
    link?: string;
    price?: string;
    imageUrl?: string;
}

/**
 * Lookup Google Product Catalog via Serper Shopping.
 *
 * @returns Match canonical (name/brand/photo/price) ou null si rien trouvé.
 */
export async function lookupGoogleShopping(options: {
    ean?: string | null;
    name?: string | null;
    brand?: string | null;
}): Promise<GoogleShoppingMatch | null> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return null;

    // ─── Strategy : déterminer la query la plus précise ───
    let query = "";
    let confidence: "strong" | "weak" = "weak";
    if (options.ean && options.ean.trim().length >= 8) {
        query = options.ean.trim();
        confidence = "strong";
    } else if (options.brand && options.name) {
        query = `${options.brand.trim()} ${options.name.trim()}`;
    } else if (options.name) {
        query = options.name.trim();
    } else {
        return null;
    }

    // ─── Appel Serper Shopping ───
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
        const res = await fetch(SERPER_SHOPPING_URL, {
            method: "POST",
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ q: query, gl: "fr", hl: "fr" }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) return null;

        const json = (await res.json()) as { shopping?: ShoppingItem[] };
        const items = json.shopping ?? [];
        if (items.length === 0) return null;

        const top = items[0];
        if (!top.title) return null;

        return {
            canonical_name: top.title,
            // Serper renvoie "source" qui est le shop e.g. "Nike.com" — pas la
            // brand. La brand sera mieux extraite via collectAllEanSources V2
            // si EAN trouvé. Pour V1 on laisse null sauf si query par brand.
            brand: confidence === "weak" && options.brand ? options.brand : null,
            photo_url: top.imageUrl ?? null,
            price: parseSerperPrice(top.price ?? null),
            confidence,
            source_url: top.link ?? null,
        };
    } catch {
        clearTimeout(timeout);
        return null;
    }
}

/**
 * Parse Serper price string ("129,99 €" / "$1,299.00" / "129.99 EUR")
 * → numeric (en EUR si possible).
 */
function parseSerperPrice(priceStr: string | null): number | null {
    if (!priceStr) return null;
    // Garde chiffres + virgule + point
    const cleaned = priceStr.replace(/[^\d.,]/g, "");
    if (!cleaned) return null;
    // Format français "129,99" → "129.99"
    const normalized = cleaned.includes(",") && !cleaned.includes(".")
        ? cleaned.replace(",", ".")
        : cleaned.replace(/,/g, "");
    const num = Number.parseFloat(normalized);
    return Number.isFinite(num) && num > 0 ? num : null;
}

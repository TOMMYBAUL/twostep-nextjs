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
 * Levenshtein distance pour scoreNameMatch léger (évite import cyclique de
 * lookup.ts). Identique à src/lib/ean/lookup.ts:levenshtein.
 */
function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
            const tmp = dp[j];
            dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
            prev = tmp;
        }
    }
    return dp[n];
}

/** Score [0,1] de match nom ↔ titre top result Serper. Variante simple. */
function scoreTitleMatch(input: string, candidate: string): number {
    const a = input.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
    const b = candidate.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    const lev = 1 - levenshtein(a, b) / maxLen;
    const aw = new Set(a.split(" ").filter((w) => w.length > 2));
    const bw = new Set(b.split(" ").filter((w) => w.length > 2));
    let overlap = 0;
    for (const w of aw) if (bw.has(w)) overlap++;
    const overlapScore = aw.size > 0 ? overlap / aw.size : 0;
    return lev * 0.4 + overlapScore * 0.6;
}

const TITLE_MATCH_THRESHOLD = 0.35;

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

        // ─── Fix Sprint 1.5 — validation post-query (anti-faux-positif Serper) ───
        // Bug observé 2026-04-29 : Serper Shopping query par EAN inconnu de Google
        // Shopping retourne des best-sellers du jour (figurines, coffrets random)
        // avec imageUrl = data:image/webp;base64,... (mode widget Serper).
        // On filtre ces results pour éviter les faux positifs Tier 3 GPC.
        for (const candidate of items) {
            if (!candidate.title) continue;
            // Skip data: URIs (signature mode widget Serper, pas vrais products)
            const photo = candidate.imageUrl ?? null;
            if (photo && photo.startsWith("data:")) continue;
            // Validation cohérence titre ↔ input (sauf si confidence weak où on
            // accepte plus permissivement car query par brand+name)
            if (confidence === "strong") {
                const expected = options.name ?? "";
                if (expected && scoreTitleMatch(expected, candidate.title) < TITLE_MATCH_THRESHOLD) {
                    continue; // titre top trop éloigné de input.name → reject
                }
            }
            // Premier candidat qui passe → accept
            return {
                canonical_name: candidate.title,
                brand: confidence === "weak" && options.brand ? options.brand : null,
                photo_url: photo,
                price: parseSerperPrice(candidate.price ?? null),
                confidence,
                source_url: candidate.link ?? null,
            };
        }
        return null;
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

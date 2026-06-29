/**
 * EAN category → French taxonomy mapping (maillon 9 (d), 2026-06-29).
 *
 * WHY THIS EXISTS:
 * The real-world test of 2026-06-27 found product categories stored in ENGLISH after EAN
 * enrichment ("clothing and fashion", "toys", "home and garden" — verified in prod). The EAN
 * sources (EAN-Search `categoryName`, UPCitemdb `category`, Open*Facts `categories`) return
 * their own English taxonomy strings, and `applyEnrichment` wrote them VERBATIM to
 * `products.category`. Result: a French shopper (and the merchant) saw English category labels,
 * and they don't match our French L1 taxonomy slugs (migration 041) used everywhere else.
 *
 * WHAT THIS IS (and is NOT):
 * A faithful TRANSLATOR from a recognised English source-category string to one of our 15 French
 * L1 slugs. It is NOT a classifier — it does not look at the product, only at the label the source
 * gave. The authoritative French categorisation is the AI path (`categorize.ts`, confidence-gated,
 * reads the product name) which OVERWRITES `products.category` with the correct slug once it runs.
 * The EAN category is only a FALLBACK for the window before AI runs (or while AI keys are absent).
 *
 * WHY AN ALLOW-LIST AND null-ON-UNKNOWN (north-star: ZERO false positives):
 * Same principle as the brand allow-list (`brand.ts`). We only translate strings we explicitly
 * recognise as unambiguous. An unknown or ambiguous source label → `null` (don't write), which is
 * a strict non-regression: the slot stays empty for the AI path to fill correctly, and no English
 * garbage or guessed category is shown. We never emit a slug that isn't in the taxonomy.
 *
 * KNOWN LIMITATION (source mislabel, NOT a mapping bug): the 2026-06-27 test had Coca-Cola tagged
 * "home and garden" by the EAN source. We translate that faithfully to `maison-deco` — the wrong
 * category for a drink, but the wrongness is the SOURCE's, not ours. The real fix for source
 * mislabels is the AI path (`categorize.ts`, which reads "Coca-Cola Original Taste" and would pick
 * `alimentation`); it is currently inert in prod because GROQ/GEMINI keys are absent (escalated).
 */

/**
 * The 15 French level-1 taxonomy slugs (migration 041_categories_tree.sql). The mapper may ONLY
 * ever emit a value from this set — a test asserts it, so a typo can never publish a dead slug.
 */
export const FR_L1_SLUGS: readonly string[] = [
    "mode",
    "chaussures",
    "beaute",
    "bijoux-accessoires",
    "sport-outdoor",
    "tech-electronique",
    "maison-deco",
    "alimentation",
    "enfants",
    "culture-loisirs",
    "sante-bien-etre",
    "animaux",
    "auto-mobilite",
    "bricolage-jardin",
    // NB: "seconde-main" is a valid slug but intentionally has no English source mapping —
    // EAN databases categorise by product TYPE, not by condition. Only the AI path can assign it.
    "seconde-main",
];

const FR_L1_SLUG_SET = new Set(FR_L1_SLUGS);

/**
 * Normalise a category label for matching: lowercase, strip diacritics, drop the connector word
 * "and" and any "&", collapse every non-alphanumeric run to a single space, trim. This unifies the
 * many spellings the sources use, e.g. "Home & Garden" and "Home and Garden" → "home garden";
 * "Food, Beverages & Tobacco" → "food beverages tobacco"; "Clothing and Fashion" → "clothing fashion".
 */
function normalizeCategory(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Mn}/gu, "") // strip combining diacritics (robust across encodings)
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\band\b/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

/**
 * Allow-list of recognised English (and a few French) source category labels → French L1 slug.
 * Keys are in NORMALISED form (see `normalizeCategory`). Only unambiguous mappings are included;
 * genuinely ambiguous labels (e.g. bare "games", "office", "personal care") are intentionally
 * OMITTED so they resolve to null rather than a guess. Extend freely — adding a key can only make
 * the translation MORE complete, never introduce a false positive (every value is a valid slug).
 */
const CATEGORY_MAP: Readonly<Record<string, string>> = {
    // ── Mode / apparel ──
    "clothing fashion": "mode",
    "clothing": "mode",
    "apparel": "mode",
    "apparel accessories": "mode",
    "fashion": "mode",
    "clothing shoes accessories": "mode",
    "clothing shoes jewelry": "mode",
    "mens clothing": "mode",
    "womens clothing": "mode",

    // ── Chaussures ──
    "shoes": "chaussures",
    "footwear": "chaussures",
    "sneakers": "chaussures",

    // ── Beauté ──
    "beauty": "beaute",
    "health beauty": "beaute",
    "beauty personal care": "beaute",
    "cosmetics": "beaute",
    "makeup": "beaute",
    "fragrances": "beaute",
    "fragrance": "beaute",
    "perfume": "beaute",
    "skincare": "beaute",
    "skin care": "beaute",

    // ── Bijoux & accessoires ──
    "jewelry": "bijoux-accessoires",
    "jewellery": "bijoux-accessoires",
    "watches": "bijoux-accessoires",
    "luggage bags": "bijoux-accessoires",
    "bags": "bijoux-accessoires",
    "handbags": "bijoux-accessoires",
    "handbags wallets": "bijoux-accessoires",
    "sunglasses": "bijoux-accessoires",
    "eyewear": "bijoux-accessoires",

    // ── Sport & outdoor ──
    "sports outdoors": "sport-outdoor",
    "sporting goods": "sport-outdoor",
    "sports": "sport-outdoor",
    "outdoors": "sport-outdoor",
    "fitness": "sport-outdoor",
    "exercise fitness": "sport-outdoor",
    "sports fitness outdoors": "sport-outdoor",

    // ── Tech & électronique ──
    "electronics": "tech-electronique",
    "consumer electronics": "tech-electronique",
    "computers": "tech-electronique",
    "computers accessories": "tech-electronique",
    "cell phones": "tech-electronique",
    "cell phones accessories": "tech-electronique",
    "phones": "tech-electronique",
    "cameras optics": "tech-electronique",
    "cameras": "tech-electronique",
    "camera photo": "tech-electronique",
    "software": "tech-electronique",
    "video games": "tech-electronique",

    // ── Maison & déco ──
    "home garden": "maison-deco",
    "home": "maison-deco",
    "home kitchen": "maison-deco",
    "kitchen": "maison-deco",
    "kitchen dining": "maison-deco",
    "furniture": "maison-deco",
    "home decor": "maison-deco",
    "household": "maison-deco",
    "home furniture diy": "maison-deco",

    // ── Alimentation ──
    "food beverage": "alimentation",
    "food beverages": "alimentation",
    "food beverages tobacco": "alimentation",
    "grocery": "alimentation",
    "grocery gourmet food": "alimentation",
    "food": "alimentation",
    "beverages": "alimentation",
    "drinks": "alimentation",
    "wine": "alimentation",

    // ── Enfants ──
    "toys": "enfants",
    "toys games": "enfants",
    "baby": "enfants",
    "baby toddler": "enfants",
    "baby products": "enfants",

    // ── Culture & loisirs ──
    "books": "culture-loisirs",
    "media": "culture-loisirs",
    "music": "culture-loisirs",
    "movies": "culture-loisirs",
    "movies tv": "culture-loisirs",
    "musical instruments": "culture-loisirs",
    "arts entertainment": "culture-loisirs",
    "cds vinyl": "culture-loisirs",

    // ── Santé & bien-être ──
    "health": "sante-bien-etre",
    "healthcare": "sante-bien-etre",
    "health household": "sante-bien-etre",
    "health personal care": "sante-bien-etre",
    "pharmacy": "sante-bien-etre",
    "vitamins supplements": "sante-bien-etre",

    // ── Animaux ──
    "pet supplies": "animaux",
    "pets": "animaux",
    "pet": "animaux",
    "animals pet supplies": "animaux",

    // ── Auto & mobilité ──
    "automotive": "auto-mobilite",
    "vehicles parts": "auto-mobilite",
    "auto parts": "auto-mobilite",
    "car motorbike": "auto-mobilite",
    "automotive parts accessories": "auto-mobilite",

    // ── Bricolage & jardin ──
    "tools hardware": "bricolage-jardin",
    "hardware": "bricolage-jardin",
    "tools": "bricolage-jardin",
    "tools home improvement": "bricolage-jardin",
    "home improvement": "bricolage-jardin",
    "garden": "bricolage-jardin",
    "patio lawn garden": "bricolage-jardin",
    "diy": "bricolage-jardin",
};

/**
 * Translate a raw source category label to a French L1 taxonomy slug, or null if unrecognised.
 *
 *  - A label that is ALREADY a valid French L1 slug passes through unchanged (idempotent).
 *  - A recognised English/French label maps via the allow-list.
 *  - Anything else → null (never invent a category; let the AI path fill it correctly).
 */
export function mapEanCategoryToFr(raw: string | null | undefined): string | null {
    if (!raw) return null;

    // Already a French L1 slug? (categorize.ts writes these; keep it idempotent.)
    const trimmed = raw.trim().toLowerCase();
    if (FR_L1_SLUG_SET.has(trimmed)) return trimmed;

    const norm = normalizeCategory(raw);
    if (!norm) return null;

    return CATEGORY_MAP[norm] ?? null;
}

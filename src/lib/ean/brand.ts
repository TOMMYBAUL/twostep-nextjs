/**
 * Brand recovery from an authoritative resolved name or the merchant's own name.
 *
 * WHY THIS EXISTS (maillon 9 (c), 2026-06-28):
 * The real-world test of 2026-06-27 found `brand` null on 7/7 products. Root cause:
 * EAN-Search — the PRIMARY EAN source (best EU coverage, tried first in `fetchEanData`) —
 * never returns a brand field (`brand: null`, see `fetchFromEanSearch`). So any product
 * resolved by it kept `brand=null` even though the authoritative resolved name almost always
 * carries the brand ("Nike Air Force 1…", "Bose QuietComfort…"). UPCitemdb / OBF / OPF do
 * return brands, but they are only reached when EAN-Search fails — i.e. rarely.
 *
 * WHY AN ALLOW-LIST AND NOT A HEURISTIC:
 * The north-star is "exactitude = la promesse" with ZERO false positives. Inventing a brand
 * (e.g. taking the first capitalised token of a noisy POS name) is exactly the kind of false
 * positive that makes a merchant leave and Google reject the feed. An allow-list can only ever
 * emit a brand we explicitly recognise — it never invents. A brand we don't recognise stays
 * `null`, which is a strict non-regression (it was null before) and is SAFE.
 *
 * This recovers the brand → which feeds (a) the Serper image query (`buildImageSearchQueries`,
 * maillon 9 (b)) so photos are searched as "Nike <name>" instead of a bare name, and (b) the
 * Google `g:brand` attribute (recommended by Google Shopping). Both are core to the north-star.
 */

/**
 * Curated allow-list of well-known brands relevant to a French multi-brand "neuf" shop
 * (the pilot profile: fashion, leather goods, sneakers, electronics, toys, beauty, food).
 * Canonical casing is what we emit. Multi-word brands ("Ray-Ban", "New Balance") are matched
 * as whole phrases after normalisation. Extend this list as new brands appear — adding a brand
 * can only make recovery MORE complete, never introduce a false positive.
 */
export const KNOWN_BRANDS: readonly string[] = [
    // Sneakers / sportswear
    "Nike", "Adidas", "Puma", "Reebok", "New Balance", "Asics", "Converse", "Vans",
    "Under Armour", "Salomon", "The North Face", "Patagonia", "Columbia", "Fila",
    "Jordan", "Saucony", "On Running", "Hoka",
    // Fashion / apparel
    "Carhartt", "Levi's", "Lacoste", "Ralph Lauren", "Tommy Hilfiger", "Calvin Klein",
    "Hugo Boss", "Diesel", "Guess", "Superdry", "Champion", "Stone Island", "Napapijri",
    "Schott", "Dickies", "Ben Sherman", "Fred Perry", "Kway", "K-Way", "Aigle",
    // Leather goods / accessories
    "Eastpak", "Herschel", "Samsonite", "Longchamp", "Michael Kors", "Fossil",
    "Ray-Ban", "Oakley", "Persol",
    // Luxury / premium
    "Gucci", "Prada", "Versace", "Burberry", "Yves Saint Laurent", "Saint Laurent",
    "Balenciaga", "Givenchy", "Moncler", "Dr. Martens", "Timberland", "Birkenstock",
    "UGG", "Repetto",
    // Watches / jewellery
    "Casio", "Seiko", "Citizen", "Swatch", "Daniel Wellington", "Cluse",
    // Consumer electronics / audio
    "Bose", "Sony", "Samsung", "Apple", "Sennheiser", "JBL", "Beats", "Marshall",
    "Bang & Olufsen", "Logitech", "Anker", "Philips", "Panasonic", "LG", "Xiaomi",
    "Huawei", "GoPro", "Nintendo", "PlayStation", "Xbox", "Garmin", "Fitbit",
    "Harman Kardon", "Beats by Dre",
    // Toys / kids
    "Lego", "Playmobil", "VTech", "Fisher-Price", "Hasbro", "Mattel", "Funko",
    "Ravensburger", "Schleich", "Nerf", "Barbie", "Hot Wheels",
    // Beauty / cosmetics
    "L'Oréal", "Garnier", "Maybelline", "Nivea", "La Roche-Posay", "Vichy", "Bioderma",
    "Avène", "Caudalie", "The Ordinary", "Cerave", "Eucerin", "Yves Rocher",
    "Estée Lauder", "Clinique", "Lancôme", "Sephora",
    // Food / beverage
    "Coca-Cola", "Pepsi", "Nestlé", "Danone", "Lindt", "Haribo", "Ferrero", "Nutella",
    "Red Bull", "Monster", "Oasis", "Evian", "Perrier", "Lipton",
    // Home / appliances
    "Moulinex", "Tefal", "SEB", "Rowenta", "Dyson", "Bosch", "Krups", "Nespresso",
    "De'Longhi", "Braun", "Babyliss",
    // Tools / DIY
    "Bosch Professional", "Makita", "DeWalt", "Stanley", "Loctite", "Zebra",
];

/**
 * Normalise a string for brand matching: lowercase, strip diacritics, collapse every
 * non-alphanumeric run to a single space, trim. "Ray-Ban" → "ray ban", "L'Oréal" → "l oreal".
 */
function normalizeForBrand(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

// Pre-normalise once, sorted longest-first so multi-word brands win over any shorter
// substring brand (e.g. prefer "new balance" before a hypothetical "balance").
const NORMALIZED_BRANDS: ReadonlyArray<{ canonical: string; norm: string }> = KNOWN_BRANDS
    .map((b) => ({ canonical: b, norm: normalizeForBrand(b) }))
    .filter((b) => b.norm.length > 0)
    .sort((a, b) => b.norm.length - a.norm.length);

/**
 * Return the first recognised brand that appears as a WHOLE word/phrase in `text`, else null.
 * Whole-word matching (space-padded) avoids substring false positives ("Nike" must NOT match
 * "technike", "LG" must NOT match "bulgari"). Never invents — only returns allow-list brands.
 */
export function extractKnownBrand(text: string | null | undefined): string | null {
    if (!text) return null;
    const norm = normalizeForBrand(text);
    if (!norm) return null;
    const padded = ` ${norm} `;
    for (const { canonical, norm: brandNorm } of NORMALIZED_BRANDS) {
        if (padded.includes(` ${brandNorm} `)) return canonical;
    }
    return null;
}

/**
 * Resolve the brand to store for an enriched product.
 *  1. Trust the brand the EAN source returned, if any (validated downstream by the
 *     coherence guard in `applyEnrichment`).
 *  2. Otherwise recover a RECOGNISED brand from the authoritative resolved name first
 *     (it is keyed by the merchant's scanned barcode), then the merchant's own name.
 *  3. Otherwise null — never invent.
 */
export function resolveBrand(
    sourceBrand: string | null | undefined,
    resolvedName: string | null | undefined,
    merchantName: string | null | undefined,
): string | null {
    if (sourceBrand && sourceBrand.trim().length > 0) return sourceBrand.trim();
    return extractKnownBrand(resolvedName) ?? extractKnownBrand(merchantName) ?? null;
}

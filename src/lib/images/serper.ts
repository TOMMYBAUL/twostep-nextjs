/**
 * Serper Google Images — find product photos by name.
 * Used as fallback when UPCitemdb/OpenEAN don't return a photo.
 *
 * Requires SERPER_API_KEY env variable.
 * Free tier: 2500 credits (~50$/year).
 */

const SERPER_API_URL = "https://google.serper.dev/images";

/** HEAD-check that an image URL actually responds 200 */
async function verifyImageUrl(url: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4_000);
        const res = await fetch(url, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "follow",
        });
        clearTimeout(timeout);
        return res.ok;
    } catch {
        return false;
    }
}

type SerperImageResult = {
    imageUrl: string;
    title: string;
    source: string;
    domain: string;
    imageWidth: number;
    imageHeight: number;
};

// E-commerce domains get priority — their product photos are clean and reliable
const ECOMMERCE_DOMAINS = new Set([
    // Marketplaces
    "amazon.fr", "amazon.com", "zalando.fr", "zalando.com", "asos.com",
    "cdiscount.com", "fnac.com", "darty.com", "ldlc.com",
    // Fashion retailers
    "wethenew.com", "courir.com", "footlocker.fr", "jdsports.fr",
    "galerieslafayette.com", "printemps.com", "placedestendances.com",
    // Brand official sites
    "nike.com", "adidas.com", "adidas.fr", "levi.com",
    "sezane.com", "apc.fr", "veja-store.com", "newbalance.com",
    "carhartt-wip.com", "armorlux.com", "petitbateau.com",
    // Beauty
    "sephora.fr", "nocibe.fr", "marionnaud.fr",
    // General e-commerce
    "intersport.fr", "decathlon.fr", "manomano.fr",
    "boulanger.com", "cultura.com", "laredoute.fr",
]);

/**
 * Search Google Images for a product photo.
 * Strategy: EAN+name first (exact match), then name-only fallback.
 * Returns the best verified image URL or null.
 */
export async function searchProductImage(
    productName: string,
    brand?: string | null,
    ean?: string | null,
): Promise<string | null> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        console.error("[serper] SERPER_API_KEY is not set!");
        return null;
    }

    // Strategy 1: EAN + name → finds the EXACT product variant
    if (ean) {
        const eanQuery = `${ean} ${productName}`;
        const eanResult = await searchSerperImages(apiKey, eanQuery);
        if (eanResult) return eanResult;
    }

    // Strategy 2: brand + name + "fiche produit" → e-commerce catalog shots
    const parts = [];
    if (brand) parts.push(brand);
    parts.push(productName);
    parts.push("fiche produit");
    const query = parts.join(" ");

    return searchSerperImages(apiKey, query);
}

async function searchSerperImages(apiKey: string, query: string): Promise<string | null> {

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8_000);

        const res = await fetch(SERPER_API_URL, {
            method: "POST",
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                q: query,
                gl: "fr",
                hl: "fr",
                num: 10,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[serper] API error: ${res.status}`);
            return null;
        }

        const data = await res.json();
        const images: SerperImageResult[] = data.images ?? [];

        console.log("[serper] Query:", query, "→", images.length, "images raw");

        if (images.length === 0) return null;

        // Filter: HTTPS only, min 200px (some product images are 256x256)
        const good = images.filter(
            (img) => img.imageWidth >= 200 && img.imageHeight >= 200 && img.imageUrl.startsWith("https"),
        );

        console.log("[serper] After filter:", good.length, "images ≥200px");

        if (good.length === 0) return null;

        // Score: e-commerce domain bonus + aspect ratio + size
        const scored = good.map((img) => {
            const ratio = img.imageWidth / img.imageHeight;
            const squareScore = 1 - Math.abs(ratio - 1) / 2;
            const sizeScore = Math.min(img.imageWidth, 1200) / 1200;
            // E-commerce domains get a big bonus — their photos are product shots
            const domain = img.domain?.replace(/^www\./, "") ?? "";
            const ecomBonus = ECOMMERCE_DOMAINS.has(domain) ? 0.5 : 0;
            return { img, score: squareScore * 0.4 + sizeScore * 0.2 + ecomBonus + 0.4 };
        }).sort((a, b) => b.score - a.score);

        // Try top candidates in score order, verify each URL
        for (const { img } of scored.slice(0, 5)) {
            const alive = await verifyImageUrl(img.imageUrl);
            if (alive) return img.imageUrl;
        }

        return null;
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            console.warn("[serper] Request timed out");
        } else {
            console.warn("[serper] Error:", err);
        }
        return null;
    }
}

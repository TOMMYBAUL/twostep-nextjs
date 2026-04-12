/**
 * Serper Google Images — find product photos by name.
 * Used as fallback when UPCitemdb/OpenEAN don't return a photo.
 *
 * Requires SERPER_API_KEY env variable.
 * Free tier: 2500 credits (~50$/year).
 */

const SERPER_API_URL = "https://google.serper.dev/images";

/**
 * Ask Claude Haiku to verify if a product photo matches the expected product.
 * Returns true if the photo matches, false if it doesn't or on error.
 * Cost: ~$0.001 per call.
 */
async function verifyPhotoWithAI(imageUrl: string, productName: string, brand?: string | null): Promise<boolean> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return true; // Skip verification if no API key

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const productDesc = brand ? `${brand} ${productName}` : productName;

        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 10,
                messages: [{
                    role: "user",
                    content: [
                        { type: "image", source: { type: "url", url: imageUrl } },
                        { type: "text", text: `Le produit attendu est : "${productDesc}". Cette photo montre-t-elle ce produit (même modèle, même couleur) ? Réponds UNIQUEMENT "oui" ou "non".` },
                    ],
                }],
            }),
            signal: controller.signal,
        });

        clearTimeout(timeout);
        if (!res.ok) return true; // On error, don't block — accept the photo

        const data = await res.json();
        const answer = (data.content?.[0]?.text ?? "").toLowerCase().trim();
        const isMatch = answer.startsWith("oui");

        if (!isMatch) {
            console.log(`[serper-ai] Photo rejected for "${productDesc}" — AI said: ${answer}`);
        }

        return isMatch;
    } catch {
        return true; // On error, accept the photo rather than blocking
    }
}

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
 * Strategy cascade: SKU (most precise) → EAN+name → name-only fallback.
 * Returns the best verified image URL or null.
 */
export async function searchProductImage(
    productName: string,
    brand?: string | null,
    ean?: string | null,
    sku?: string | null,
): Promise<string | null> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        console.error("[serper] SERPER_API_KEY is not set!");
        return null;
    }

    // Strategy 1: SKU/reference → most precise (e.g. "DD1391-100" = one exact product)
    if (sku && sku.length >= 4) {
        const skuQuery = brand ? `${sku} ${brand}` : `${sku} ${productName}`;
        const skuResult = await searchSerperImages(apiKey, skuQuery, productName, brand);
        if (skuResult) return skuResult;
    }

    // Strategy 2: EAN + name → finds the EXACT product variant
    if (ean) {
        const eanQuery = `${ean} ${productName}`;
        const eanResult = await searchSerperImages(apiKey, eanQuery, productName, brand);
        if (eanResult) return eanResult;
    }

    // Strategy 3: brand + name + "fiche produit" → e-commerce catalog shots
    const parts = [];
    if (brand) parts.push(brand);
    parts.push(productName);
    parts.push("fiche produit");
    const query = parts.join(" ");

    return searchSerperImages(apiKey, query, productName, brand);
}

async function searchSerperImages(
    apiKey: string,
    query: string,
    productName?: string,
    brand?: string | null,
): Promise<string | null> {

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

        // Try top candidates in score order: verify URL exists, then AI-verify content
        for (const { img } of scored.slice(0, 5)) {
            const alive = await verifyImageUrl(img.imageUrl);
            if (!alive) continue;

            // AI verification: does this photo actually show the expected product?
            if (productName) {
                const aiMatch = await verifyPhotoWithAI(img.imageUrl, productName, brand);
                if (!aiMatch) continue; // Wrong product — try next candidate
            }

            return img.imageUrl;
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

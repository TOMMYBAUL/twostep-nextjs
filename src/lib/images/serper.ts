/**
 * Serper Google Images — find product photos by name.
 * Used as fallback when UPCitemdb/OpenEAN don't return a photo.
 *
 * Requires SERPER_API_KEY env variable.
 * Free tier: 2500 credits (~50$/year).
 */

import { captureError } from "@/lib/error";

const SERPER_API_URL = "https://google.serper.dev/images";

/**
 * One-time guard so we surface the "verification disabled" degraded mode ONCE per
 * process instead of flooding Sentry on every candidate of every product.
 */
let warnedVerifierDisabled = false;

/**
 * Ask Claude Haiku to verify if a sourced product photo actually matches the
 * expected product (anti visual false-positive — north-star « zéro faux positif »).
 *
 * Contract (corrigé 2026-06-23) :
 *  - **Verification ON** (clé présente) et une ERREUR survient (HTTP !ok / timeout /
 *    throw) → on retourne **false** = « non vérifié » : le candidat est ÉCARTÉ (le
 *    caller passe au suivant). Une erreur de vérif n'est PAS une preuve de match —
 *    retourner true reviendrait à publier une image potentiellement fausse sans preuve
 *    (même anti-pattern fail-open que `verifySIRET valid:true`). Best-effort : si TOUS
 *    les candidats échouent, aucune image ce run, ré-essayée au prochain cycle d'enrich.
 *  - **Verification OFF** (clé ABSENTE, cas prod aujourd'hui) → on retourne true (on ne
 *    bloque pas), MAIS on le rend OBSERVABLE (captureError une fois) car des images
 *    sourcées sont alors publiées SANS vérification de contenu. Le choix « publier ou
 *    bloquer les images non vérifiées en prod » est une décision produit → escaladée.
 * Cost: ~$0.001 per call.
 */
export async function verifyPhotoWithAI(
    imageUrl: string,
    productName: string,
    brand?: string | null,
    color?: string | null,
): Promise<boolean> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        // Verification désactivée par config (clé absente). On NE bloque pas (compat),
        // mais on le signale une fois — sinon « images publiées sans vérif » est muet.
        if (!warnedVerifierDisabled) {
            warnedVerifierDisabled = true;
            captureError(
                new Error(
                    "Image AI verification disabled: ANTHROPIC_API_KEY missing — sourced images are published WITHOUT content verification",
                ),
                { module: "serper", phase: "verifyPhotoWithAI" },
            );
        }
        return true;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const productDesc = brand ? `${brand} ${productName}` : productName;
        // Fix 30/04 — si coloris connu, on demande à Haiku de le vérifier visuellement.
        // Sans ce check, une AM90 verte passait OK sur "Nike Air Max 90 Noir/Blanc".
        const colorCheck = color
            ? `\n3. Le coloris dominant de ce produit dans la photo correspond-il à "${color}" ?`
            : "";
        const criteriaCount = color ? "trois" : "deux";

        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 20,
                messages: [{
                    role: "user",
                    content: [
                        { type: "image", source: { type: "url", url: imageUrl } },
                        { type: "text", text: `Le produit attendu est : "${productDesc}". Vérifie ${criteriaCount} choses :
1. Cette photo montre-t-elle ce produit (même modèle, même marque) ?
2. La qualité est-elle suffisante pour un site e-commerce (nette, pas pixelisée, pas de watermark, pas un screenshot) ?${colorCheck}
Réponds UNIQUEMENT "oui" si TOUS les critères sont remplis, sinon "non".` },
                    ],
                }],
            }),
            signal: controller.signal,
        });

        clearTimeout(timeout);
        if (!res.ok) {
            // Verification ON mais en erreur → on ne PEUT pas affirmer le match → écarter
            // le candidat (≠ accepter à l'aveugle). Visible pour Sentry, ré-essayé au prochain run.
            captureError(new Error(`Image verifier HTTP ${res.status}`), {
                module: "serper",
                phase: "verifyPhotoWithAI",
                productName,
            });
            return false;
        }

        const data = await res.json();
        const answer = (data.content?.[0]?.text ?? "").toLowerCase().trim();
        const isMatch = answer.startsWith("oui");

        if (!isMatch) {
            console.log(`[serper-ai] Photo rejected for "${productDesc}" — AI said: ${answer}`);
        }

        return isMatch;
    } catch (err) {
        // Timeout / réseau / throw : pas une preuve de match → écarter le candidat (visible).
        captureError(err, { module: "serper", phase: "verifyPhotoWithAI", productName });
        return false;
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
    // Beauty & skincare
    "sephora.fr", "sephora.com", "nocibe.fr", "marionnaud.fr",
    "beautycorea.fr", "yesstyle.com", "jolse.com", "stylevana.com",
    "cosmetique-coree.fr", "miin-cosmetics.com", "skinlyest.com",
    "lookfantastic.fr", "cultbeauty.com", "beautybay.com",
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
    /** Fix 30/04 — coloris attendu (ex "Noir/Blanc"). Étoffe la query + Haiku verify. */
    color?: string | null,
): Promise<string | null> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        console.error("[serper] SERPER_API_KEY is not set!");
        return null;
    }

    // Helper : suffixe coloris ajouté à chaque query si dispo (ex " Noir Blanc")
    // Normalise / → espace pour la query Google
    const colorSuffix = color
        ? " " + color.replace(/[\/,]/g, " ").replace(/\s+/g, " ").trim()
        : "";

    // Strategy 1: SKU/reference → most precise (e.g. "DD1391-100" = one exact product)
    if (sku && sku.length >= 4) {
        const skuQuery = (brand ? `${sku} ${brand}` : `${sku} ${productName}`) + colorSuffix;
        const skuResult = await searchSerperImages(apiKey, skuQuery, productName, brand, color);
        if (skuResult) return skuResult;
    }

    // Strategy 2: EAN + name → finds the EXACT product variant
    if (ean) {
        const eanQuery = `${ean} ${productName}${colorSuffix}`;
        const eanResult = await searchSerperImages(apiKey, eanQuery, productName, brand, color);
        if (eanResult) return eanResult;
    }

    // Strategy 3: brand + name + coloris + "product" → e-commerce catalog shots
    const parts = [];
    if (brand) parts.push(brand);
    parts.push(productName);
    if (color) parts.push(color.replace(/[\/,]/g, " ").trim());
    parts.push("product");
    const query = parts.join(" ");

    const result = await searchSerperImages(apiKey, query, productName, brand, color);
    if (result) return result;

    // Strategy 4: French search fallback for local brands
    const frParts = [];
    if (brand) frParts.push(brand);
    frParts.push(productName);
    if (color) frParts.push(color.replace(/[\/,]/g, " ").trim());
    frParts.push("fiche produit");

    return searchSerperImages(apiKey, frParts.join(" "), productName, brand, color);
}

async function searchSerperImages(
    apiKey: string,
    query: string,
    productName?: string,
    brand?: string | null,
    color?: string | null,
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
            // Le moteur d'images lui-même est en erreur (≠ « 0 résultat ») → rendre visible :
            // sinon une panne Serper = plus aucune image publiée, en silence.
            captureError(new Error(`Serper API HTTP ${res.status}`), {
                module: "serper",
                phase: "searchSerperImages",
                query,
            });
            return null;
        }

        const data = await res.json();
        const images: SerperImageResult[] = data.images ?? [];

        console.log("[serper] Query:", query, "→", images.length, "images raw");

        if (images.length === 0) return null;

        // Filter: HTTPS only, min 400px (reject thumbnails and low-res)
        const good = images.filter(
            (img) => img.imageWidth >= 400 && img.imageHeight >= 400 && img.imageUrl.startsWith("https"),
        );

        console.log("[serper] After filter:", good.length, "images ≥400px");

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
                const aiMatch = await verifyPhotoWithAI(img.imageUrl, productName, brand, color);
                if (!aiMatch) continue; // Wrong product or wrong color — try next candidate
            }

            return img.imageUrl;
        }

        return null;
    } catch (err) {
        // Timeout / réseau sur l'appel Serper → image search KO sans signal = images perdues
        // en silence. Visible (le retry naturel = prochain cycle d'enrich, photo_url toujours null).
        captureError(err, { module: "serper", phase: "searchSerperImages", query });
        return null;
    }
}

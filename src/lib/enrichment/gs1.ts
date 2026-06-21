/**
 * Tier 1 — GS1 (CodeOnline Search / Verified by GS1) : source AUTORITATIVE.
 *
 * C'est le seul référentiel où la donnée produit est déposée par le PROPRIÉTAIRE
 * DE MARQUE (titulaire du préfixe GS1). Un match GS1 sur un GTIN = certitude que
 * ce code-barres correspond réellement à ce produit → score 0,99 (auto-publish).
 * C'est la pièce qui garantit "le bon EAN, zéro faux positif".
 *
 * Accès : GS1 France CodeOnline Search (REST). Nécessite l'adhésion GS1 France
 * + une clé API. Tarif Basic : 0 €/50 000 req/mois.
 *
 * ⚠️ Le mapping exact des champs de réponse doit être confirmé contre la doc GS1
 * (gs1.fr/api-codeonline-search) une fois la clé obtenue. `parseGs1Response` est
 * écrit défensivement pour absorber les variantes de nommage courantes.
 */

import { validEanOrNull } from "@/lib/ean/validate";

export type Gs1Result = {
    gtin: string;
    name: string | null;
    brand: string | null;
    imageUrl: string | null;
    category: string | null;
    /** Source brute pour audit/debug. */
    raw?: unknown;
};

/** Récupère la 1ère valeur non vide parmi plusieurs noms de champ possibles. */
function pick(obj: Record<string, unknown>, keys: string[]): string | null {
    for (const k of keys) {
        const v = obj[k];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
}

/**
 * Parse une réponse GS1 (CodeOnline / Verified by GS1) en Gs1Result normalisé.
 * Pur (testable). Retourne null si la réponse ne contient pas d'item exploitable.
 *
 * Gère deux formes courantes :
 *  - objet item direct
 *  - enveloppe { items: [item] } / { results: [item] } / { data: [...] }
 */
export function parseGs1Response(json: unknown): Gs1Result | null {
    if (!json || typeof json !== "object") return null;

    // Déballer une éventuelle enveloppe liste.
    let item: Record<string, unknown> | null = null;
    const obj = json as Record<string, unknown>;
    for (const listKey of ["items", "results", "data", "products"]) {
        const arr = obj[listKey];
        if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "object") {
            item = arr[0] as Record<string, unknown>;
            break;
        }
    }
    if (!item) item = obj;

    const gtinRaw = pick(item, ["gtin", "gtinValue", "gtin13", "barcode", "code"]);
    const gtin = validEanOrNull(gtinRaw);
    if (!gtin) return null; // pas de GTIN valide → pas une identité fiable

    const name = pick(item, [
        "productName",
        "productDescription",
        "description",
        "name",
        "label",
        "tradeItemDescription",
    ]);
    const brand = pick(item, ["brandName", "brand", "brandNameInformation", "marque"]);
    const imageUrl = pick(item, [
        "productImageUrl",
        "imageUrl",
        "image",
        "productImage",
        "imageURL",
    ]);
    const category = pick(item, [
        "gpcCategoryName",
        "gpcCategory",
        "categoryName",
        "category",
        "globalClassificationCategory",
    ]);

    return { gtin, name, brand, imageUrl, category, raw: item };
}

/**
 * Interroge GS1 CodeOnline pour un GTIN. Retourne null si :
 *  - pas de clé configurée (no-op gracieux),
 *  - GTIN invalide,
 *  - aucun item trouvé / erreur réseau.
 *
 * Env : GS1_CODEONLINE_API_KEY (requis), GS1_CODEONLINE_URL (optionnel, défaut FR).
 */
export async function lookupGs1(gtinRaw: string): Promise<Gs1Result | null> {
    const apiKey = process.env.GS1_CODEONLINE_API_KEY;
    if (!apiKey) return null; // tier inactif tant que l'adhésion/clé GS1 n'est pas en place

    const gtin = validEanOrNull(gtinRaw);
    if (!gtin) return null;

    const base = process.env.GS1_CODEONLINE_URL ?? "https://api.gs1.fr/codeonline/v1/search";

    try {
        const url = `${base}?gtin=${encodeURIComponent(gtin)}`;
        const res = await fetch(url, {
            headers: {
                Accept: "application/json",
                // En-tête d'auth à ajuster selon la doc GS1 (Bearer vs apikey header).
                Authorization: `Bearer ${apiKey}`,
                apikey: apiKey,
            },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return parseGs1Response(json);
    } catch {
        return null; // best-effort : un échec GS1 ne bloque pas la cascade
    }
}

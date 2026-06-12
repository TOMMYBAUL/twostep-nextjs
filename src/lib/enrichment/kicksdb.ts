/**
 * Tier sneakers — KicksDB (kicks.dev) : agrège StockX / GOAT / Flight Club.
 *
 * Comble le trou de la cascade sur la mode/sneakers (que GS1 et Open*Facts
 * couvrent mal). Résout EAN/UPC, style code (SKU) ou nom → modèle + marque +
 * images + VARIANTES PAR TAILLE. Les tailles renvoyées règlent aussi le problème
 * d'`available_sizes` pour les sneakers de marque.
 *
 * Accès : clé API KicksDB. Tarif : Free 1 000 req/mois, Starter 29 €/mois.
 * No-op gracieux tant que KICKSDB_API_KEY est absente.
 *
 * ⚠️ Mapping de champs à confirmer contre la doc kicks.dev une fois la clé obtenue ;
 * `parseKicksResponse` est défensif.
 */

import { validEanOrNull } from "@/lib/ean/validate";

export type KicksVariant = { size: string; price: number | null };

export type KicksResult = {
    sku: string | null;
    gtin: string | null;
    name: string | null;
    brand: string | null;
    imageUrl: string | null;
    sizes: KicksVariant[];
    raw?: unknown;
};

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
    for (const k of keys) {
        const s = str(obj[k]);
        if (s) return s;
    }
    return null;
}

function parseVariants(item: Record<string, unknown>): KicksVariant[] {
    const arr =
        (Array.isArray(item.variants) && item.variants) ||
        (Array.isArray(item.sizes) && item.sizes) ||
        [];
    const out: KicksVariant[] = [];
    for (const v of arr as unknown[]) {
        if (!v || typeof v !== "object") continue;
        const o = v as Record<string, unknown>;
        const size = pick(o, ["size", "us_size", "label", "value"]);
        if (!size) continue;
        const priceRaw = o.price ?? o.lowest_ask ?? o.retail_price ?? null;
        const price =
            typeof priceRaw === "number"
                ? priceRaw
                : typeof priceRaw === "string" && priceRaw.trim()
                  ? Number(priceRaw) || null
                  : null;
        out.push({ size, price });
    }
    return out;
}

/** Parse une réponse KicksDB en KicksResult normalisé. Pur (testable). */
export function parseKicksResponse(json: unknown): KicksResult | null {
    if (!json || typeof json !== "object") return null;
    const obj = json as Record<string, unknown>;

    let item: Record<string, unknown> | null = null;
    for (const listKey of ["data", "results", "products", "hits"]) {
        const arr = obj[listKey];
        if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "object") {
            item = arr[0] as Record<string, unknown>;
            break;
        }
    }
    if (!item) item = obj;

    const name = pick(item, ["name", "title", "model", "shoe", "productName"]);
    const sku = pick(item, ["sku", "style_id", "styleCode", "styleId", "style"]);
    // Un item sans nom ni SKU n'est pas exploitable.
    if (!name && !sku) return null;

    const gtin = validEanOrNull(pick(item, ["gtin", "upc", "ean", "barcode"]));
    const brand = pick(item, ["brand", "brandName", "manufacturer"]);
    const imageUrl = pick(item, ["image", "imageUrl", "thumbnail", "main_picture_url", "grid_picture_url"]);

    return { sku, gtin, name, brand, imageUrl, sizes: parseVariants(item), raw: item };
}

/**
 * Interroge KicksDB par EAN/UPC, SKU ou nom. Retourne null si pas de clé,
 * pas de query, ou pas de match.
 */
export async function lookupKicksDb(query: {
    ean?: string | null;
    sku?: string | null;
    name?: string | null;
}): Promise<KicksResult | null> {
    const apiKey = process.env.KICKSDB_API_KEY;
    if (!apiKey) return null;

    const term =
        validEanOrNull(query.ean ?? null) ??
        (query.sku?.trim() || null) ??
        (query.name?.trim() || null);
    if (!term) return null;

    const base = process.env.KICKSDB_URL ?? "https://api.kicks.dev/v3/stockx/products";

    try {
        const url = `${base}?query=${encodeURIComponent(term)}&limit=1`;
        const res = await fetch(url, {
            headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        return parseKicksResponse(await res.json());
    } catch {
        return null;
    }
}

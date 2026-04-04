import crypto from "crypto";

import { signState } from "@/lib/auth/state-token";
import type { IPOSAdapter, POSProduct, POSPromo, POSStockUpdate } from "./types";

function getBaseUrl(): string {
    return process.env.SQUARE_ENVIRONMENT === "sandbox"
        ? "https://connect.squareupsandbox.com"
        : "https://connect.squareup.com";
}

async function squareFetch(path: string, accessToken: string, options?: RequestInit) {
    const res = await fetch(`${getBaseUrl()}/v2${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Square-Version": "2025-01-23",
            ...options?.headers,
        },
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.errors?.[0]?.detail || `Square API error: ${res.status}`);
    }

    return res.json();
}

export const squareAdapter: IPOSAdapter = {
    name: "square",

    getAuthUrl(merchantId: string): string {
        const params = new URLSearchParams({
            client_id: process.env.SQUARE_APP_ID!,
            scope: "MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE INVENTORY_READ INVENTORY_WRITE",
            session: "false",
            state: signState(`square:${merchantId}`),
        });
        return `${getBaseUrl()}/oauth2/authorize?${params}`;
    },

    async exchangeCode(code: string) {
        const res = await fetch(`${getBaseUrl()}/oauth2/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Square-Version": "2025-01-23" },
            body: JSON.stringify({
                client_id: process.env.SQUARE_APP_ID,
                client_secret: process.env.SQUARE_APP_SECRET,
                code,
                grant_type: "authorization_code",
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.errors?.[0]?.detail || "OAuth exchange failed");

        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: data.expires_at,
        };
    },

    async refreshToken(refreshToken: string) {
        const res = await fetch(`${getBaseUrl()}/oauth2/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Square-Version": "2025-01-23" },
            body: JSON.stringify({
                client_id: process.env.SQUARE_APP_ID,
                client_secret: process.env.SQUARE_APP_SECRET,
                refresh_token: refreshToken,
                grant_type: "refresh_token",
            }),
        });
        const data = await res.json();
        if (!res.ok) return null;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: data.expires_at,
        };
    },

    async getCatalog(accessToken: string): Promise<POSProduct[]> {
        const products: POSProduct[] = [];
        const imageIdsToFetch = new Set<string>();
        const categoryIdsToFetch = new Set<string>();
        let cursor: string | undefined;

        do {
            const params = new URLSearchParams({ types: "ITEM" });
            if (cursor) params.set("cursor", cursor);

            const data = await squareFetch(`/catalog/list?${params}`, accessToken);

            for (const obj of data.objects || []) {
                if (obj.type !== "ITEM") continue;
                const item = obj.item_data;

                // Collect image IDs for batch fetch
                for (const imgId of item.image_ids ?? []) {
                    imageIdsToFetch.add(imgId);
                }

                // Collect category ID for batch fetch
                const categoryId = item.category_id ?? item.reporting_category?.id ?? null;
                if (categoryId) categoryIdsToFetch.add(categoryId);

                for (const variation of item.variations || []) {
                    const v = variation.item_variation_data;
                    const name =
                        (item.variations?.length ?? 0) > 1
                            ? `${item.name} — ${v.name}`
                            : item.name;

                    // SKU is only a valid EAN/UPC if it's 12-13 digits
                    const sku: string | null = v.sku || null;
                    const ean = sku && /^\d{12,13}$/.test(sku) ? sku : null;

                    products.push({
                        pos_item_id: variation.id,
                        name,
                        ean,
                        price: v.price_money ? Number(v.price_money.amount) / 100 : null,
                        category: categoryId ? `__square_cat__${categoryId}` : null,
                        // Store parent item ID temporarily to resolve images later
                        photo_url: item.image_ids?.[0] ? `__square_img__${item.image_ids[0]}` : null,
                    });
                }
            }

            cursor = data.cursor;
        } while (cursor);

        // Batch fetch category names from Square
        if (categoryIdsToFetch.size > 0) {
            const categoryMap = new Map<string, string>();
            const ids = [...categoryIdsToFetch];

            for (let i = 0; i < ids.length; i += 100) {
                const batch = ids.slice(i, i + 100);
                try {
                    const data = await squareFetch("/catalog/batch-retrieve", accessToken, {
                        method: "POST",
                        body: JSON.stringify({ object_ids: batch }),
                    });
                    for (const obj of data.objects ?? []) {
                        if (obj.type === "CATEGORY" && obj.category_data?.name) {
                            categoryMap.set(obj.id, obj.category_data.name);
                        }
                    }
                } catch {
                    // Non-critical: products will have no category
                }
            }

            // Resolve placeholder category IDs to names
            for (const product of products) {
                if (product.category?.startsWith("__square_cat__")) {
                    const catId = product.category.slice("__square_cat__".length);
                    product.category = categoryMap.get(catId) ?? null;
                }
            }
        }

        // Batch fetch image URLs from Square
        if (imageIdsToFetch.size > 0) {
            const imageMap = new Map<string, string>();
            const ids = [...imageIdsToFetch];

            for (let i = 0; i < ids.length; i += 100) {
                const batch = ids.slice(i, i + 100);
                try {
                    const data = await squareFetch("/catalog/batch-retrieve", accessToken, {
                        method: "POST",
                        body: JSON.stringify({ object_ids: batch }),
                    });
                    for (const obj of data.objects ?? []) {
                        if (obj.type === "IMAGE" && obj.image_data?.url) {
                            imageMap.set(obj.id, obj.image_data.url);
                        }
                    }
                } catch {
                    // Non-critical: products will have no photo
                }
            }

            // Resolve placeholder URLs to real image URLs
            for (const product of products) {
                if (product.photo_url?.startsWith("__square_img__")) {
                    const imgId = product.photo_url.slice("__square_img__".length);
                    product.photo_url = imageMap.get(imgId) ?? null;
                }
            }
        }

        return products;
    },

    async getStock(accessToken: string, itemIds: string[]): Promise<POSStockUpdate[]> {
        if (itemIds.length === 0) return [];

        const locData = await squareFetch("/locations", accessToken);
        const locationIds = (locData.locations || []).map((l: Record<string, string>) => l.id);
        if (locationIds.length === 0) return [];

        const updates: POSStockUpdate[] = [];

        // Square batch limit is 100
        for (let i = 0; i < itemIds.length; i += 100) {
            const batch = itemIds.slice(i, i + 100);
            const data = await squareFetch("/inventory/counts/batch-retrieve", accessToken, {
                method: "POST",
                body: JSON.stringify({
                    catalog_object_ids: batch,
                    location_ids: locationIds,
                    states: ["IN_STOCK"],
                }),
            });

            for (const count of data.counts || []) {
                updates.push({
                    pos_item_id: count.catalog_object_id,
                    quantity: parseInt(count.quantity || "0", 10),
                    updated_at: count.calculated_at || new Date().toISOString(),
                });
            }
        }

        return updates;
    },

    async fetchPromos(accessToken: string): Promise<POSPromo[]> {
        const promos: POSPromo[] = [];
        let cursor: string | undefined;

        do {
            const params = new URLSearchParams({ types: "DISCOUNT" });
            if (cursor) params.set("cursor", cursor);

            const data = await squareFetch(`/catalog/list?${params}`, accessToken);

            for (const obj of data.objects || []) {
                if (obj.type !== "DISCOUNT") continue;
                const d = obj.discount_data;
                if (!d) continue;

                const isPercentage = d.discount_type === "FIXED_PERCENTAGE";
                promos.push({
                    pos_promo_id: obj.id,
                    name: d.name || "Promotion",
                    type: isPercentage ? "percentage" : "fixed_amount",
                    value: isPercentage
                        ? parseFloat(d.percentage || "0")
                        : d.amount_money ? Number(d.amount_money.amount) / 100 : 0,
                    product_ids: d.product_set_data?.product_ids_any || [],
                    starts_at: null,
                    ends_at: null,
                });
            }

            cursor = data.cursor;
        } while (cursor);

        return promos;
    },

    verifyWebhook(body: string, signature: string): boolean {
        const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
        if (!key) return false;

        const notificationUrl = process.env.SQUARE_WEBHOOK_URL || "";
        const hmac = crypto
            .createHmac("sha256", key)
            .update(notificationUrl + body)
            .digest("base64");

        try {
            return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
        } catch {
            return false;
        }
    },

    async pushCatalog(accessToken: string, products: POSProduct[]): Promise<void> {
        const objects = products.map((p) => ({
            type: "ITEM",
            id: `#${p.pos_item_id || crypto.randomUUID()}`,
            item_data: {
                name: p.name,
                variations: [
                    {
                        type: "ITEM_VARIATION",
                        id: `#var-${crypto.randomUUID()}`,
                        item_variation_data: {
                            name: p.name,
                            pricing_type: p.price ? "FIXED_PRICING" : "VARIABLE_PRICING",
                            ...(p.price && {
                                price_money: {
                                    amount: Math.round(p.price * 100),
                                    currency: "EUR",
                                },
                            }),
                            sku: p.ean ?? undefined,
                        },
                    },
                ],
            },
        }));

        for (let i = 0; i < objects.length; i += 1000) {
            const batch = objects.slice(i, i + 1000);
            await squareFetch("/catalog/batch-upsert", accessToken, {
                method: "POST",
                body: JSON.stringify({
                    idempotency_key: crypto.randomUUID(),
                    batches: [{ objects: batch }],
                }),
            });
        }
    },

    parseWebhookEvent(body: unknown): POSStockUpdate[] | null {
        const event = body as Record<string, unknown>;
        if (event?.type !== "inventory.count.updated") return null;

        const data = event.data as Record<string, unknown> | undefined;
        const obj = data?.object as Record<string, unknown> | undefined;
        const counts = obj?.inventory_counts;
        if (!Array.isArray(counts)) return null;

        return counts.map((c: Record<string, string>) => ({
            pos_item_id: c.catalog_object_id,
            quantity: parseInt(c.quantity || "0", 10),
            updated_at: c.calculated_at || new Date().toISOString(),
        }));
    },
};

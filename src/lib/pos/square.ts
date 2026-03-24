import crypto from "crypto";

import type { IPOSAdapter, POSProduct, POSStockUpdate } from "./types";

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
            state: `square:${merchantId}`,
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
        let cursor: string | undefined;

        do {
            const params = new URLSearchParams({ types: "ITEM" });
            if (cursor) params.set("cursor", cursor);

            const data = await squareFetch(`/catalog/list?${params}`, accessToken);

            for (const obj of data.objects || []) {
                if (obj.type !== "ITEM") continue;
                const item = obj.item_data;

                for (const variation of item.variations || []) {
                    const v = variation.item_variation_data;
                    const name =
                        (item.variations?.length ?? 0) > 1
                            ? `${item.name} — ${v.name}`
                            : item.name;

                    products.push({
                        pos_item_id: variation.id,
                        name,
                        ean: v.sku || null,
                        price: v.price_money ? Number(v.price_money.amount) / 100 : null,
                        category: null,
                        photo_url: null,
                    });
                }
            }

            cursor = data.cursor;
        } while (cursor);

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

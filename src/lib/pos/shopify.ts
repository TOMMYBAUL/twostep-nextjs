import crypto from "crypto";
import { signState } from "@/lib/auth/state-token";
import { getSiteUrl } from "@/lib/url";
import type { IPOSAdapter, POSAdapterOptions, POSProduct, POSPromo, POSStockUpdate } from "./types";

function shopApi(shopDomain: string, path: string): string {
    return `https://${shopDomain}/admin/api/2024-01${path}`;
}

function requireShop(options?: POSAdapterOptions): string {
    const shop = options?.shopDomain;
    if (!shop) throw new Error("Shopify adapter requires shopDomain in options");
    return shop;
}

export const shopifyAdapter: IPOSAdapter = {
    name: "shopify",

    getAuthUrl(merchantId: string): string {
        const baseUrl = getSiteUrl();
        const params = new URLSearchParams({
            client_id: process.env.SHOPIFY_CLIENT_ID!,
            scope: "read_products,write_products,read_inventory,write_inventory",
            redirect_uri: `${baseUrl}/api/pos/shopify/callback`,
            state: signState(`shopify:${merchantId}`),
        });
        return `https://accounts.shopify.com/oauth/authorize?${params}`;
    },

    async exchangeCode(code: string, params?: Record<string, string>) {
        const shop = params?.shop;
        if (!shop) throw new Error("Shopify exchangeCode requires shop param");

        const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: process.env.SHOPIFY_CLIENT_ID,
                client_secret: process.env.SHOPIFY_CLIENT_SECRET,
                code,
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.errors || data.error || "Shopify OAuth exchange failed");

        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? null,
            // Shopify offline tokens don't expire
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        };
    },

    async refreshToken(_refreshToken: string) {
        // Shopify offline tokens don't expire — no refresh needed
        return null;
    },

    async getCatalog(accessToken: string, options?: POSAdapterOptions) {
        const shop = requireShop(options);
        const products: POSProduct[] = [];
        let pageInfo: string | null = null;

        do {
            const url: string = pageInfo
                ? shopApi(shop, `/products.json?page_info=${pageInfo}&limit=250`)
                : shopApi(shop, "/products.json?limit=250");

            const res: Response = await fetch(url, {
                headers: { "X-Shopify-Access-Token": accessToken },
            });
            const data = await res.json();

            for (const product of data.products ?? []) {
                for (const variant of product.variants ?? []) {
                    products.push({
                        // Use variant.id as pos_item_id — this is what webhooks send
                        pos_item_id: String(variant.id),
                        name: product.variants.length > 1
                            ? `${product.title} — ${variant.title}`
                            : product.title,
                        ean: variant.barcode || null,
                        price: variant.price ? parseFloat(variant.price) : null,
                        category: product.product_type?.toLowerCase() || null,
                        photo_url: product.image?.src ?? null,
                    });
                }
            }

            // Parse Link header for pagination
            const linkHeader: string | null = res.headers.get("link");
            const nextMatch: RegExpMatchArray | null | undefined = linkHeader?.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
            pageInfo = nextMatch?.[1] ?? null;
        } while (pageInfo);

        return products;
    },

    async pushCatalog(accessToken: string, products: POSProduct[], options?: POSAdapterOptions): Promise<Record<string, string>> {
        const shop = requireShop(options);
        const idMappings: Record<string, string> = {};
        for (const p of products) {
            const res = await fetch(shopApi(shop, "/products.json"), {
                method: "POST",
                headers: {
                    "X-Shopify-Access-Token": accessToken,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    product: {
                        title: p.name,
                        variants: [{
                            price: p.price?.toString() ?? "0.00",
                            barcode: p.ean ?? "",
                            sku: p.ean ?? "",
                        }],
                    },
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.product?.id) {
                    idMappings[p.pos_item_id || p.name] = String(data.product.id);
                }
            }
        }
        return idMappings;
    },

    async fetchPromos(accessToken: string, options?: POSAdapterOptions): Promise<POSPromo[]> {
        const shop = requireShop(options);
        const res = await fetch(shopApi(shop, "/price_rules.json"), {
            headers: { "X-Shopify-Access-Token": accessToken },
        });
        if (!res.ok) return [];

        const data = await res.json();
        const promos: POSPromo[] = [];

        for (const rule of data.price_rules ?? []) {
            const isPercentage = rule.value_type === "percentage";
            promos.push({
                pos_promo_id: String(rule.id),
                name: rule.title || "Promotion",
                type: isPercentage ? "percentage" : "fixed_amount",
                value: Math.abs(parseFloat(rule.value || "0")),
                product_ids: rule.entitled_product_ids?.map(String) ?? [],
                starts_at: rule.starts_at ?? null,
                ends_at: rule.ends_at ?? null,
            });
        }

        return promos;
    },

    async getStock(accessToken: string, itemIds: string[], options?: POSAdapterOptions) {
        const shop = requireShop(options);
        const updates: POSStockUpdate[] = [];

        // itemIds are variant_ids (from getCatalog). Shopify inventory API
        // needs inventory_item_ids. We resolve them via /variants.json batch.
        // Map: variant_id → inventory_item_id
        const variantToInventory = new Map<string, string>();

        for (let i = 0; i < itemIds.length; i += 50) {
            const batch = itemIds.slice(i, i + 50);
            const res = await fetch(
                shopApi(shop, `/variants.json?ids=${batch.join(",")}&fields=id,inventory_item_id`),
                { headers: { "X-Shopify-Access-Token": accessToken } }
            );
            const data = await res.json();
            for (const v of data.variants ?? []) {
                variantToInventory.set(String(v.id), String(v.inventory_item_id));
            }
        }

        // Now fetch inventory levels using resolved inventory_item_ids
        const inventoryIds = [...variantToInventory.values()];
        const inventoryToVariant = new Map<string, string>();
        for (const [vId, iId] of variantToInventory) {
            inventoryToVariant.set(iId, vId);
        }

        for (let i = 0; i < inventoryIds.length; i += 50) {
            const batch = inventoryIds.slice(i, i + 50);
            const res = await fetch(
                shopApi(shop, `/inventory_levels.json?inventory_item_ids=${batch.join(",")}`),
                { headers: { "X-Shopify-Access-Token": accessToken } }
            );
            const data = await res.json();

            for (const level of data.inventory_levels ?? []) {
                const variantId = inventoryToVariant.get(String(level.inventory_item_id));
                if (!variantId) continue;
                updates.push({
                    pos_item_id: variantId,
                    quantity: level.available ?? 0,
                    updated_at: level.updated_at ?? new Date().toISOString(),
                });
            }
        }

        return updates;
    },

    verifyWebhook(body: string, signature: string): boolean {
        if (!process.env.SHOPIFY_WEBHOOK_SECRET) return false;
        const expected = crypto
            .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
            .update(body)
            .digest("base64");
        try {
            return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        } catch {
            return false;
        }
    },

    parseWebhookEvent(body: unknown): POSStockUpdate[] | null {
        const event = body as { line_items?: Array<{ variant_id: number; quantity: number }> };
        if (!event.line_items) return null;

        return event.line_items.map((item) => ({
            pos_item_id: String(item.variant_id),
            quantity: -item.quantity, // Negative = stock decrease from order
            updated_at: new Date().toISOString(),
        }));
    },
};

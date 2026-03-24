import crypto from "crypto";
import type { IPOSAdapter, POSProduct, POSStockUpdate } from "./types";

export const shopifyAdapter: IPOSAdapter = {
    name: "shopify",

    getAuthUrl(merchantId: string): string {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
        const params = new URLSearchParams({
            client_id: process.env.SHOPIFY_CLIENT_ID!,
            scope: "read_products,write_products,read_inventory,write_inventory",
            redirect_uri: `${baseUrl}/api/pos/connect`,
            state: `shopify:${merchantId}`,
        });
        return `https://accounts.shopify.com/oauth/authorize?${params}`;
    },

    async exchangeCode(code: string) {
        const res = await fetch("https://accounts.shopify.com/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: process.env.SHOPIFY_CLIENT_ID,
                client_secret: process.env.SHOPIFY_CLIENT_SECRET,
                code,
                grant_type: "authorization_code",
            }),
        });
        const data = await res.json();
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? null,
            expires_at: data.expires_in
                ? new Date(Date.now() + data.expires_in * 1000).toISOString()
                : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        };
    },

    async getCatalog(accessToken: string) {
        const products: POSProduct[] = [];
        let pageInfo: string | null = null;

        do {
            const fetchUrl: string = pageInfo
                ? `https://shopify.dev/admin/api/2024-01/products.json?page_info=${pageInfo}&limit=250`
                : "https://shopify.dev/admin/api/2024-01/products.json?limit=250";

            const fetchRes: Response = await fetch(fetchUrl, {
                headers: { "X-Shopify-Access-Token": accessToken },
            });
            const data = await fetchRes.json();

            for (const product of data.products ?? []) {
                for (const variant of product.variants ?? []) {
                    products.push({
                        pos_item_id: String(variant.id),
                        name: product.variants.length > 1
                            ? `${product.title} — ${variant.title}`
                            : product.title,
                        ean: variant.barcode || null,
                        price: variant.price ? parseFloat(variant.price) : null,
                        category: product.product_type || null,
                        photo_url: product.image?.src ?? null,
                    });
                }
            }

            // Parse Link header for pagination
            const linkHeader: string | null = fetchRes.headers.get("link");
            const nextMatch: RegExpMatchArray | null | undefined = linkHeader?.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
            pageInfo = nextMatch?.[1] ?? null;
        } while (pageInfo);

        return products;
    },

    async pushCatalog(accessToken: string, products: POSProduct[]) {
        for (const p of products) {
            await fetch("https://shopify.dev/admin/api/2024-01/products.json", {
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
        }
    },

    async getStock(accessToken: string, itemIds: string[]) {
        const updates: POSStockUpdate[] = [];
        for (const itemId of itemIds) {
            const res = await fetch(
                `https://shopify.dev/admin/api/2024-01/inventory_levels.json?inventory_item_ids=${itemId}`,
                { headers: { "X-Shopify-Access-Token": accessToken } }
            );
            const data = await res.json();
            const level = data.inventory_levels?.[0];
            updates.push({
                pos_item_id: itemId,
                quantity: level?.available ?? 0,
                updated_at: level?.updated_at ?? new Date().toISOString(),
            });
        }
        return updates;
    },

    verifyWebhook(body: string, signature: string): boolean {
        const expected = crypto
            .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET ?? "")
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

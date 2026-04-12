import crypto from "crypto";
import { signState } from "@/lib/auth/state-token";
import { getSiteUrl } from "@/lib/url";
import type { IPOSAdapter, POSProduct, POSStockUpdate } from "./types";

export const zettleAdapter: IPOSAdapter = {
    name: "zettle",

    getAuthUrl(merchantId: string): string {
        const params = new URLSearchParams({
            client_id: process.env.ZETTLE_CLIENT_ID!,
            redirect_uri: getSiteUrl() + "/api/pos/zettle/callback",
            response_type: "code",
            scope: "READ:PRODUCT WRITE:PRODUCT READ:INVENTORY",
            state: signState(`zettle:${merchantId}`),
        });
        return `https://oauth.zettle.com/authorize?${params}`;
    },

    async exchangeCode(code: string) {
        const res = await fetch("https://oauth.zettle.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                client_id: process.env.ZETTLE_CLIENT_ID!,
                client_secret: process.env.ZETTLE_CLIENT_SECRET!,
                code,
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error_description || "Zettle OAuth exchange failed");

        const expiresIn = data.expires_in ?? 7200;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        };
    },

    async refreshToken(refreshToken: string) {
        const res = await fetch("https://oauth.zettle.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                client_id: process.env.ZETTLE_CLIENT_ID!,
                client_secret: process.env.ZETTLE_CLIENT_SECRET!,
                refresh_token: refreshToken,
            }),
        });

        const data = await res.json();
        if (!res.ok) return null;

        const expiresIn = data.expires_in ?? 7200;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        };
    },

    async getCatalog(accessToken: string): Promise<POSProduct[]> {
        const res = await fetch("https://products.izettle.com/organizations/self/products/v2", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.developerMessage || `Zettle products API error: ${res.status}`);
        }

        const data = await res.json();
        const products: POSProduct[] = [];

        for (const product of data ?? []) {
            const variants: Array<{
                uuid: string;
                name: string;
                price?: { amount: number };
                sku?: string;
                barcode?: string;
            }> = product.variants ?? [];

            const isMultiVariant = variants.length > 1;

            // Zettle Products API v2 provides:
            // - product.category?.name for category
            // - product.imageLookupKeys[] for images (requires separate image fetch)
            // - product.presentation?.imageUrl for the first product image
            const category: string | null = product.category?.name ?? null;
            const photoUrl: string | null = product.presentation?.imageUrl
                ?? (product.imageLookupKeys?.[0]
                    ? `https://image.izettle.com/v2/images/o/${product.imageLookupKeys[0]}`
                    : null);

            for (const variant of variants) {
                const name = isMultiVariant
                    ? `${product.name} — ${variant.name}`
                    : product.name;

                products.push({
                    pos_item_id: variant.uuid,
                    name,
                    ean: variant.barcode ?? variant.sku ?? null,
                    price: variant.price ? variant.price.amount / 100 : null,
                    category,
                    photo_url: photoUrl,
                });
            }
        }

        return products;
    },

    async getStock(accessToken: string, itemIds: string[]): Promise<POSStockUpdate[]> {
        if (itemIds.length === 0) return [];

        const res = await fetch("https://inventory.izettle.com/organizations/self/inventory/v3", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.developerMessage || `Zettle inventory API error: ${res.status}`);
        }

        const data = await res.json();
        const itemIdSet = new Set(itemIds);
        const updates: POSStockUpdate[] = [];

        for (const entry of data?.variants ?? []) {
            if (!itemIdSet.has(entry.variantUuid)) continue;
            updates.push({
                pos_item_id: entry.variantUuid,
                quantity: entry.balance ?? 0,
                updated_at: new Date().toISOString(),
            });
        }

        return updates;
    },

    async fetchPromos(): Promise<import("./types").POSPromo[]> {
        // Zettle n'a pas de promos API
        return [];
    },

    verifyWebhook(body: string, signature: string): boolean {
        const signingKey = process.env.ZETTLE_WEBHOOK_SIGNING_KEY;
        if (!signingKey || !signature) return false;

        // Zettle signs: {timestamp}.{payload} with HMAC SHA-256 hex
        let timestamp: string;
        try {
            const parsed = JSON.parse(body);
            timestamp = parsed.timestamp;
        } catch {
            return false;
        }
        if (!timestamp) return false;

        const expected = crypto
            .createHmac("sha256", signingKey)
            .update(`${timestamp}.${body}`)
            .digest("hex");

        try {
            return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
        } catch {
            return false;
        }
    },

    parseWebhookEvent(body: unknown): POSStockUpdate[] | null {
        const event = body as Record<string, unknown>;
        if (event.eventName !== "InventoryBalanceChanged") return null;

        const payload = event.payload as Record<string, unknown> | undefined;
        const balanceAfter = payload?.balanceAfter;
        if (!Array.isArray(balanceAfter)) return null;

        const updates: POSStockUpdate[] = [];
        for (const entry of balanceAfter) {
            const e = entry as Record<string, unknown>;
            const variantUuid = e.variantUuid ?? e.productUuid;
            if (!variantUuid) continue;

            updates.push({
                pos_item_id: String(variantUuid),
                quantity: typeof e.balance === "number" ? e.balance : parseInt(String(e.balance), 10) || 0,
                updated_at: String(event.timestamp ?? new Date().toISOString()),
            });
        }

        return updates.length > 0 ? updates : null;
    },

    // POS-3: catalog push not yet implemented
    async pushCatalog(_accessToken: string, _products: POSProduct[]): Promise<Record<string, string>> {
        return {};
    },
};

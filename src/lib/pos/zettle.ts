import crypto from "crypto";
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
            state: `zettle:${merchantId}`,
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

            for (const variant of variants) {
                const name = isMultiVariant
                    ? `${product.name} — ${variant.name}`
                    : product.name;

                products.push({
                    pos_item_id: variant.uuid,
                    name,
                    ean: variant.barcode ?? variant.sku ?? null,
                    price: variant.price ? variant.price.amount / 100 : null,
                    category: null,
                    photo_url: null,
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

    // POS-3: webhook verification not yet implemented
    verifyWebhook(_body: string, _signature: string): boolean {
        void crypto; // imported for consistency with other adapters
        return false;
    },

    // POS-3: webhook parsing not yet implemented
    parseWebhookEvent(_body: unknown): POSStockUpdate[] | null {
        return null;
    },

    // POS-3: catalog push not yet implemented
    async pushCatalog(_accessToken: string, _products: POSProduct[]): Promise<void> {
        // stub
    },
};

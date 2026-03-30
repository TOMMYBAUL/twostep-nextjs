import crypto from "crypto";

import { getSiteUrl } from "@/lib/url";
import type { IPOSAdapter, POSProduct, POSStockUpdate } from "./types";

export const sumupAdapter: IPOSAdapter = {
    name: "sumup",

    getAuthUrl(merchantId: string): string {
        const params = new URLSearchParams({
            client_id: process.env.SUMUP_CLIENT_ID!,
            redirect_uri: getSiteUrl() + "/api/pos/sumup/callback",
            response_type: "code",
            scope: "products",
            state: `sumup:${merchantId}`,
        });
        return `https://api.sumup.com/authorize?${params}`;
    },

    async exchangeCode(code: string) {
        const res = await fetch("https://api.sumup.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "authorization_code",
                client_id: process.env.SUMUP_CLIENT_ID,
                client_secret: process.env.SUMUP_CLIENT_SECRET,
                code,
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error_description || "SumUp OAuth exchange failed");

        const expiresIn = data.expires_in ?? 60 * 24 * 60 * 60; // default 60 days in seconds
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        };
    },

    async refreshToken(refreshToken: string) {
        const res = await fetch("https://api.sumup.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "refresh_token",
                client_id: process.env.SUMUP_CLIENT_ID,
                client_secret: process.env.SUMUP_CLIENT_SECRET,
                refresh_token: refreshToken,
            }),
        });

        const data = await res.json();
        if (!res.ok) return null;

        const expiresIn = data.expires_in ?? 60 * 24 * 60 * 60;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        };
    },

    async getCatalog(accessToken: string): Promise<POSProduct[]> {
        const res = await fetch("https://api.sumup.com/v0.1/me/products", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as Record<string, string>).message || `SumUp API error: ${res.status}`);
        }

        const data = await res.json();
        const items: unknown[] = Array.isArray(data) ? data : (data.items ?? []);

        return items.map((product) => {
            const p = product as Record<string, unknown>;
            return {
                pos_item_id: String(p.id),
                name: String(p.name),
                ean: (p.ean as string) || null,
                price: typeof p.price === "number" ? p.price : null,
                category: ((p.category as string) || "").toLowerCase() || null,
                photo_url: (p.image_url as string) || null,
            };
        });
    },

    async getStock(accessToken: string, itemIds: string[]): Promise<POSStockUpdate[]> {
        if (itemIds.length === 0) return [];

        const res = await fetch("https://api.sumup.com/v0.1/me/products", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) return [];

        const data = await res.json();
        const items: unknown[] = Array.isArray(data) ? data : (data.items ?? []);

        const idSet = new Set(itemIds);
        const updates: POSStockUpdate[] = [];

        for (const product of items) {
            const p = product as Record<string, unknown>;
            const id = String(p.id);
            if (!idSet.has(id)) continue;

            updates.push({
                pos_item_id: id,
                quantity: typeof p.stock_quantity === "number" ? p.stock_quantity : 0,
                updated_at: (p.updated_at as string) || new Date().toISOString(),
            });
        }

        return updates;
    },

    async fetchPromos(): Promise<import("./types").POSPromo[]> {
        // SumUp n'a pas de promos structurées dans son API
        return [];
    },

    // SumUp has no inventory webhook — only per-checkout callbacks.
    // Stock updates rely on 15-minute sync polling via sync-engine.
    verifyWebhook(_body: string, _signature: string): boolean {
        return false;
    },

    parseWebhookEvent(_body: unknown): POSStockUpdate[] | null {
        return null;
    },

    // POS-3: catalog push not yet implemented
    async pushCatalog(_accessToken: string, _products: POSProduct[]): Promise<void> {
        // stub
    },
};

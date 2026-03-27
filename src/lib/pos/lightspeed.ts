import crypto from "crypto";
import type { IPOSAdapter, POSProduct, POSPromo, POSStockUpdate } from "./types";

const LS_API = "https://api.lightspeedapp.com/API/V3";

export const lightspeedAdapter: IPOSAdapter = {
    name: "lightspeed",

    getAuthUrl(merchantId: string): string {
        const params = new URLSearchParams({
            response_type: "code",
            client_id: process.env.LIGHTSPEED_CLIENT_ID!,
            scope: "employee:all",
            state: `lightspeed:${merchantId}`,
        });
        return `https://cloud.lightspeedapp.com/oauth/authorize.php?${params}`;
    },

    async exchangeCode(code: string) {
        const res = await fetch("https://cloud.lightspeedapp.com/oauth/access_token.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.LIGHTSPEED_CLIENT_ID!,
                client_secret: process.env.LIGHTSPEED_CLIENT_SECRET!,
                code,
                grant_type: "authorization_code",
            }),
        });
        const data = await res.json();
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? null,
            expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        };
    },

    async refreshToken(refreshToken: string) {
        const res = await fetch("https://cloud.lightspeedapp.com/oauth/access_token.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.LIGHTSPEED_CLIENT_ID!,
                client_secret: process.env.LIGHTSPEED_CLIENT_SECRET!,
                refresh_token: refreshToken,
                grant_type: "refresh_token",
            }),
        });
        const data = await res.json();
        if (!res.ok) return null;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? refreshToken,
            expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        };
    },

    async getCatalog(accessToken: string) {
        const accountRes = await fetch(`${LS_API}/Account.json`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const { Account } = await accountRes.json();
        const accountID = Account.accountID;

        const products: POSProduct[] = [];
        let offset = 0;

        while (true) {
            const res = await fetch(
                `${LS_API}/Account/${accountID}/Item.json?offset=${offset}&limit=100`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const data = await res.json();
            const items = Array.isArray(data.Item) ? data.Item : data.Item ? [data.Item] : [];

            for (const item of items) {
                products.push({
                    pos_item_id: item.itemID,
                    name: item.description,
                    ean: item.upc ?? null,
                    price: item.Prices?.ItemPrice?.[0]?.amount
                        ? parseFloat(item.Prices.ItemPrice[0].amount)
                        : null,
                    category: item.Category?.name ?? null,
                    photo_url: item.Images?.Image?.baseImageURL ?? null,
                });
            }

            if (items.length < 100) break;
            offset += 100;
        }

        return products;
    },

    async fetchPromos(accessToken: string): Promise<POSPromo[]> {
        const accountRes = await fetch(`${LS_API}/Account.json`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const { Account } = await accountRes.json();
        const accountID = Account.accountID;

        const res = await fetch(
            `${LS_API}/Account/${accountID}/Item.json?load_relations=["SpecialPrices"]&limit=100`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return [];

        const data = await res.json();
        const items = Array.isArray(data.Item) ? data.Item : data.Item ? [data.Item] : [];
        const promos: POSPromo[] = [];

        for (const item of items) {
            const specials = item.SpecialPrices?.SpecialPrice;
            if (!specials) continue;
            const priceList = Array.isArray(specials) ? specials : [specials];

            for (const sp of priceList) {
                promos.push({
                    pos_promo_id: `${item.itemID}-${sp.specialPriceID}`,
                    name: `${item.description} — Prix spécial`,
                    type: "fixed_amount",
                    value: parseFloat(sp.amount || "0"),
                    product_ids: [item.itemID],
                    starts_at: sp.beginDate ?? null,
                    ends_at: sp.endDate ?? null,
                });
            }
        }

        return promos;
    },

    async pushCatalog(accessToken: string, products: POSProduct[]) {
        const accountRes = await fetch(`${LS_API}/Account.json`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const { Account } = await accountRes.json();

        for (const p of products) {
            await fetch(`${LS_API}/Account/${Account.accountID}/Item.json`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    description: p.name,
                    upc: p.ean ?? "",
                    Prices: p.price ? { ItemPrice: [{ amount: p.price.toString(), useType: "Default" }] } : undefined,
                }),
            });
        }
    },

    async getStock(accessToken: string, itemIds: string[]) {
        const accountRes = await fetch(`${LS_API}/Account.json`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const { Account } = await accountRes.json();

        const updates: POSStockUpdate[] = [];
        for (const itemId of itemIds) {
            const res = await fetch(
                `${LS_API}/Account/${Account.accountID}/Item/${itemId}.json?load_relations=["ItemShops"]`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const data = await res.json();
            const qty = data.Item?.ItemShops?.ItemShop?.[0]?.qoh ?? 0;
            updates.push({
                pos_item_id: itemId,
                quantity: parseInt(qty, 10),
                updated_at: new Date().toISOString(),
            });
        }
        return updates;
    },

    verifyWebhook(body: string, signature: string): boolean {
        const expected = crypto
            .createHmac("sha256", process.env.LIGHTSPEED_WEBHOOK_SECRET ?? "")
            .update(body)
            .digest("hex");
        try {
            return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        } catch {
            return false;
        }
    },

    parseWebhookEvent(body: unknown): POSStockUpdate[] | null {
        const event = body as {
            topic?: string;
            Sale?: {
                SaleLines?: {
                    SaleLine?: Array<{ itemID: string; qty: string; timeStamp: string }>;
                };
            };
        };
        if (event.topic !== "sale.completed") return null;

        const lines = event.Sale?.SaleLines?.SaleLine;
        if (!lines || lines.length === 0) return null;

        return lines.map((line) => ({
            pos_item_id: line.itemID,
            quantity: -Math.abs(parseInt(line.qty, 10)), // Negative = stock decrease
            updated_at: line.timeStamp || new Date().toISOString(),
        }));
    },
};

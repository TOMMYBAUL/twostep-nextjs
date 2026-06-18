import crypto from "crypto";
import { signState } from "@/lib/auth/state-token";
import { canonicalizeEan } from "@/lib/identifiers/validators";
import { fetchWithRetry, catalogPageLimit } from "./fetch-retry";
import type { IPOSAdapter, POSProduct, POSPromo, POSStockUpdate } from "./types";

const LS_API = "https://api.lightspeedapp.com/API/V3";

export const lightspeedAdapter: IPOSAdapter = {
    name: "lightspeed",

    getAuthUrl(merchantId: string): string {
        const params = new URLSearchParams({
            response_type: "code",
            client_id: process.env.LIGHTSPEED_CLIENT_ID!,
            // Moindre privilège : lecture catalogue (Item) + stock (ItemShop) seulement.
            // employee:all donnait accès TOTAL au compte (ventes, clients, finances).
            // (Si writeback stock activé un jour → passer à employee:inventory.)
            scope: "employee:inventory_read",
            state: signState(`lightspeed:${merchantId}`),
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
        // Sans ce garde, une erreur OAuth (res non-ok) stockait un token vide +
        // un expires_at "Invalid Date" comme une connexion valide, indiagnosticable.
        if (!res.ok || !data.access_token) {
            throw new Error(data.error_description || data.error || "Lightspeed OAuth exchange failed");
        }
        const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? null,
            expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
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
        if (!res.ok || !data.access_token) return null;
        const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? refreshToken,
            expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        };
    },

    async getCatalog(accessToken: string) {
        const accountRes = await fetchWithRetry(`${LS_API}/Account.json`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!accountRes.ok) {
            throw new Error(`Lightspeed Account API error: ${accountRes.status}`);
        }
        const { Account } = await accountRes.json();
        const accountID = Account?.accountID;
        if (!accountID) throw new Error("Lightspeed Account response missing accountID");

        const products: POSProduct[] = [];
        let offset = 0;
        let pages = 0;
        const maxPages = catalogPageLimit();

        while (true) {
            if (++pages > maxPages) throw new Error(`Lightspeed pagination > ${maxPages} pages — anomalie API`);
            const res = await fetchWithRetry(
                `${LS_API}/Account/${accountID}/Item.json?offset=${offset}&limit=100&load_relations=["Category"]`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            // Anti "catalogue fantôme" : lever sur erreur plutôt que de renvoyer un
            // catalogue tronqué/vide (qui ferait masquer toute la vitrine en aval).
            if (!res.ok) {
                throw new Error(`Lightspeed Item API error: ${res.status}`);
            }
            const data = await res.json();
            const items = Array.isArray(data.Item) ? data.Item : data.Item ? [data.Item] : [];

            for (const item of items) {
                products.push({
                    pos_item_id: item.itemID,
                    name: item.description,
                    ean: canonicalizeEan(item.upc),
                    price: item.Prices?.ItemPrice?.[0]?.amount
                        ? parseFloat(item.Prices.ItemPrice[0].amount)
                        : null,
                    category: item.Category?.name?.toLowerCase() ?? null,
                    photo_url: (() => {
                        const url = item.Images?.Image?.baseImageURL;
                        return typeof url === "string" && url.startsWith("https://") ? url : null;
                    })(),
                });
            }

            if (items.length < 100) break;
            offset += 100;
        }

        return products;
    },

    async fetchPromos(accessToken: string): Promise<POSPromo[]> {
        // Promos = non critique : on reste lenient (retour [] sur échec) pour ne
        // jamais faire échouer la sync à cause d'un hoquet sur les promos.
        const accountRes = await fetchWithRetry(`${LS_API}/Account.json`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!accountRes.ok) return [];
        const { Account } = await accountRes.json();
        const accountID = Account?.accountID;
        if (!accountID) return [];

        const res = await fetchWithRetry(
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

    async pushCatalog(accessToken: string, products: POSProduct[]): Promise<Record<string, string>> {
        const accountRes = await fetch(`${LS_API}/Account.json`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const { Account } = await accountRes.json();

        const idMappings: Record<string, string> = {};
        for (const p of products) {
            const res = await fetch(`${LS_API}/Account/${Account.accountID}/Item.json`, {
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
            if (res.ok) {
                const data = await res.json();
                if (data.Item?.itemID) {
                    idMappings[p.pos_item_id || p.name] = String(data.Item.itemID);
                }
            }
        }
        return idMappings;
    },

    async getStock(accessToken: string, itemIds: string[]) {
        const accountRes = await fetchWithRetry(`${LS_API}/Account.json`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!accountRes.ok) throw new Error(`Lightspeed Account API error: ${accountRes.status}`);
        const { Account } = await accountRes.json();
        const accountID = Account?.accountID;
        if (!accountID) throw new Error("Lightspeed Account response missing accountID");

        // Batch via ItemShop endpoint — avoids N+1 (1 request per item → paginated batches)
        // ItemShop.json supports filtering by itemID via the itemID[] param
        const qohByItemId = new Map<string, number>();
        const PAGE_SIZE = 100;

        for (let i = 0; i < itemIds.length; i += PAGE_SIZE) {
            const batch = itemIds.slice(i, i + PAGE_SIZE);
            const itemIdParam = batch.map((id) => `itemID[]=${id}`).join("&");
            const res = await fetchWithRetry(
                `${LS_API}/Account/${accountID}/ItemShop.json?${itemIdParam}&limit=${PAGE_SIZE}`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            // Lever sur erreur : un stock partiel silencieux fausse les quantités
            // affichées (dérive). resync-stock/sync-engine attrapent et marquent error.
            if (!res.ok) throw new Error(`Lightspeed ItemShop API error: ${res.status}`);
            const data = await res.json();
            const shops = Array.isArray(data.ItemShop) ? data.ItemShop : data.ItemShop ? [data.ItemShop] : [];
            for (const shop of shops) {
                const existing = qohByItemId.get(String(shop.itemID)) ?? 0;
                qohByItemId.set(String(shop.itemID), existing + parseInt(shop.qoh ?? "0", 10));
            }
        }

        const now = new Date().toISOString();
        return itemIds.map((itemId) => ({
            pos_item_id: itemId,
            quantity: qohByItemId.get(itemId) ?? 0,
            updated_at: now,
        }));
    },

    verifyWebhook(body: string, signature: string): boolean {
        if (!process.env.LIGHTSPEED_WEBHOOK_SECRET) return false;
        const expected = crypto
            .createHmac("sha256", process.env.LIGHTSPEED_WEBHOOK_SECRET)
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

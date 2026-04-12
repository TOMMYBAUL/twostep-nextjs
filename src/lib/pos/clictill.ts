import type { IPOSAdapter, POSAdapterOptions, POSProduct, POSPromo, POSStockUpdate } from "./types";

// Clictill (JDC SA) — API REST v2_10
// Doc: https://documentation-ws.clic-till.com/
// Auth: per-domain tokens in header (tokenArticle, tokenStock, etc.)
// No OAuth — tokens generated in merchant back-office (Outils > Paramètres webservices)

type ClictillTokens = {
    baseUrl: string;
    tokenArticle: string;
    tokenStock: string;
    tokenReceipt?: string;
    tokenMarkdown?: string;
    tokenClassSub?: string;
    shopCode?: string;
};

function parseClictillTokens(accessToken: string): ClictillTokens {
    return JSON.parse(accessToken);
}

/** Ping token/get to verify the baseUrl is reachable and tokens work */
export async function testClictillConnection(tokens: ClictillTokens): Promise<{ ok: boolean; error?: string }> {
    try {
        // 1. Verify baseUrl is reachable via token/get
        const tokenRes = await fetch(`${tokens.baseUrl}/api/v2_10/token/get`, {
            headers: { token: tokens.tokenArticle },
        });
        if (!tokenRes.ok) {
            return { ok: false, error: `URL inaccessible (${tokenRes.status}). Vérifiez l'adresse Clictill.` };
        }

        // 2. Try fetching 1 article to confirm tokenArticle works
        const testRes = await fetch(`${tokens.baseUrl}/api/v2_10/article/get?limit=1&modified_date=2000-01-01`, {
            headers: { token: tokens.tokenArticle, "Content-Type": "application/json" },
        });
        if (!testRes.ok) {
            return { ok: false, error: `Token Article invalide (${testRes.status}). Vérifiez dans Outils > Paramètres webservices.` };
        }
        const data = await testRes.json();
        if (data.status !== "Success") {
            return { ok: false, error: `Token Article rejeté : ${data.code_name ?? data.status}` };
        }

        // 3. Try stock token
        const stockRes = await fetch(`${tokens.baseUrl}/api/v2_10/stock/get?references=__test__&limit=1`, {
            headers: { token: tokens.tokenStock, "Content-Type": "application/json" },
        });
        if (!stockRes.ok) {
            return { ok: false, error: `Token Stock invalide (${stockRes.status}).` };
        }

        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Connexion impossible" };
    }
}

async function clictillFetch<T = Record<string, unknown>>(
    baseUrl: string,
    path: string,
    token: string,
    params?: Record<string, string>,
): Promise<T> {
    const url = new URL(`${baseUrl}/api/v2_10/${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
    }

    const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
            token,
            "Content-Type": "application/json",
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Clictill API error ${res.status}: ${text}`);
    }

    const data = await res.json() as { status: string; code: number; data: T };
    if (data.status !== "Success") {
        throw new Error(`Clictill API error: ${data.status} (code ${data.code})`);
    }

    return data.data;
}

type ClictillArticle = {
    id_article: number;
    reference: string;
    lookup: string;
    attribute1_value: string;
    attribute2_value: string;
    attribute3_value: string;
    is_activated: number;
    barcodes: Array<{ barcode: string; is_main_barcode: boolean }>;
    descriptions: Array<{ lang: string; description1: string }>;
    brand_name: string;
    category_name: string;
    department_name: string;
    family_name: string;
    subfamily_name: string;
    prices: Array<{
        code_price_name: string;
        price_wt_tax: number;
        price_wo_tax: number;
    }>;
    modified_date: string;
};

type ClictillStockItem = {
    id_article: number;
    reference: string;
    shops: Array<{
        shop_code: string;
        article_stock_quantity: number;
        available_quantity: number;
    }>;
};

type ClictillMarkdown = {
    id_mkd_header: number;
    document_number: number;
    apply_date: string | null;
    apply_date_end: string | null;
    status: number;
    mkd_detail: Array<{
        id_article: number;
        reference: string;
        origin_price: number;
        new_price: number;
    }>;
};

function buildProductName(article: ClictillArticle): string {
    const desc = article.descriptions?.find((d) => d.lang === "FR")?.description1
        || article.reference;

    const attrs = [article.attribute1_value, article.attribute2_value, article.attribute3_value]
        .filter(Boolean);

    return attrs.length > 0 ? `${desc} — ${attrs.join(" / ")}` : desc;
}

function getStandardPrice(article: ClictillArticle): number | null {
    const standard = article.prices?.find((p) => p.code_price_name === "STANDARD");
    return standard ? standard.price_wt_tax : null;
}

function getEan(article: ClictillArticle): string | null {
    for (const bc of article.barcodes ?? []) {
        if (bc.barcode && /^\d{12,13}$/.test(bc.barcode)) return bc.barcode;
    }
    return null;
}

function getCategory(article: ClictillArticle): string | null {
    return article.subfamily_name || article.family_name || article.department_name || article.category_name || null;
}

export const clictillAdapter: IPOSAdapter = {
    name: "clictill",

    getAuthUrl(_merchantId: string): string {
        // Clictill uses direct token auth, not OAuth
        // Merchant enters tokens manually in dashboard settings
        throw new Error("Clictill does not use OAuth. Configure tokens in dashboard settings.");
    },

    async exchangeCode(_code: string) {
        // No OAuth flow — tokens are configured directly
        throw new Error("Clictill does not use OAuth. Configure tokens in dashboard settings.");
    },

    async refreshToken(_refreshToken: string) {
        // Clictill tokens don't expire via refresh flow
        return null;
    },

    async getCatalog(accessToken: string, _options?: POSAdapterOptions): Promise<POSProduct[]> {
        const tokens = parseClictillTokens(accessToken);
        const products: POSProduct[] = [];
        let offset = 0;
        const limit = 500;

        do {
            const articles = await clictillFetch<ClictillArticle[]>(
                tokens.baseUrl,
                "article/get",
                tokens.tokenArticle,
                {
                    modified_date: "2000-01-01",
                    limit: String(limit),
                    offset: String(offset),
                },
            );

            if (!articles || articles.length === 0) break;

            for (const article of articles) {
                if (!article.is_activated) continue;

                // Use "reference" as pos_item_id — it's the stable identifier
                // used by both article/get and stock/get endpoints.
                // id_article is numeric and internal; reference is what Clictill
                // uses to link articles to stock across all endpoints.
                products.push({
                    pos_item_id: article.reference,
                    name: buildProductName(article),
                    ean: getEan(article),
                    price: getStandardPrice(article),
                    category: getCategory(article),
                    photo_url: null, // Clictill doesn't serve product photos via API
                });
            }

            if (articles.length < limit) break;
            offset += limit;
        } while (true);

        return products;
    },

    async getStock(accessToken: string, itemIds: string[], _options?: POSAdapterOptions): Promise<POSStockUpdate[]> {
        if (itemIds.length === 0) return [];

        const tokens = parseClictillTokens(accessToken);
        const updates: POSStockUpdate[] = [];

        // itemIds are "reference" values (set in getCatalog as pos_item_id)
        // Clictill stock/get accepts comma-separated references
        for (let i = 0; i < itemIds.length; i += 50) {
            const batch = itemIds.slice(i, i + 50);
            const stockItems = await clictillFetch<ClictillStockItem[]>(
                tokens.baseUrl,
                "stock/get",
                tokens.tokenStock,
                { references: batch.join(",") },
            );

            for (const item of stockItems ?? []) {
                // Sum stock across all shops, or filter by shopCode if set
                let quantity = 0;
                for (const shop of item.shops ?? []) {
                    if (tokens.shopCode && shop.shop_code !== tokens.shopCode) continue;
                    quantity += shop.available_quantity ?? 0;
                }

                updates.push({
                    pos_item_id: item.reference,
                    quantity,
                    updated_at: new Date().toISOString(),
                });
            }
        }

        return updates;
    },

    async fetchPromos(accessToken: string, _options?: POSAdapterOptions): Promise<POSPromo[]> {
        const tokens = parseClictillTokens(accessToken);
        if (!tokens.tokenMarkdown) return [];

        const promos: POSPromo[] = [];

        try {
            const markdowns = await clictillFetch<ClictillMarkdown[]>(
                tokens.baseUrl,
                "markdown/get",
                tokens.tokenMarkdown,
                { modified_date: "2000-01-01" },
            );

            for (const md of markdowns ?? []) {
                if (md.status !== 1) continue; // Only active markdowns

                for (const detail of md.mkd_detail ?? []) {
                    if (detail.origin_price <= 0 || detail.new_price <= 0) continue;
                    const discount = detail.origin_price - detail.new_price;
                    if (discount <= 0) continue;

                    promos.push({
                        pos_promo_id: `clictill_mkd_${md.id_mkd_header}_${detail.id_article}`,
                        name: `Démarque #${md.document_number}`,
                        type: "fixed_amount",
                        value: discount,
                        product_ids: [detail.reference],
                        starts_at: md.apply_date ?? null,
                        ends_at: md.apply_date_end ?? null,
                    });
                }
            }
        } catch {
            // Non-critical: promos are optional
        }

        return promos;
    },

    verifyWebhook(_body: string, _signature: string): boolean {
        // Clictill doesn't have a webhook system — sync via polling
        return false;
    },

    parseWebhookEvent(_body: unknown): POSStockUpdate[] | null {
        // No webhooks — sync via polling
        return null;
    },

    async pushCatalog(_accessToken: string, _products: POSProduct[], _options?: POSAdapterOptions): Promise<Record<string, string>> {
        // Push not implemented yet — Two-Step is read-only for now
        throw new Error("Clictill pushCatalog not implemented — Two-Step reads only");
    },
};

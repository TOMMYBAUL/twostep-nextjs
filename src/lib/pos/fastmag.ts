import type { IPOSAdapter, POSAdapterOptions, POSProduct, POSPromo, POSStockUpdate } from "./types";

// Fastmag (Orisha Commerce) — EDI API + BOA REST API
// EDI: POST to EDIWEBSRV.IPS / EDIQUERY.IPS with pipe-separated data
// BOA: REST API at dev.fastmag.fr/redocs/boa/ — NOT YET IMPLEMENTED
//      (endpoints, auth headers, response format are unconfirmed)
// Auth: enseigne + magasin + compte + motpasse per merchant
// No OAuth — credentials configured in merchant back-office (Fastmag Connect)
//
// ⚠️ EDI SQL QUERIES ARE BEST-GUESS — column/table names need validation
//    with a real Fastmag account. The EDI query endpoint accepts SQL-like
//    queries but the exact schema is proprietary and undocumented publicly.
//    Source: nateev/fastmag PHP lib (mechanism only) + integrator blog posts.

type FastmagCredentials = {
    enseigne: string;
    magasin: string;
    compte: string;
    motpasse: string;
    // Base URL for the Fastmag instance (e.g., https://xyz.fastmag.fr)
    baseUrl: string;
    // If BOA REST is available, use it instead of EDI
    useBoa?: boolean;
};

function parseFastmagCredentials(accessToken: string): FastmagCredentials {
    const creds = JSON.parse(accessToken);
    // BOA is not yet implemented — force EDI mode until we have confirmed docs
    creds.useBoa = false;
    return creds;
}

/** Test EDI connection by sending a lightweight query */
export async function testFastmagConnection(creds: FastmagCredentials): Promise<{ ok: boolean; error?: string }> {
    try {
        const formData = new URLSearchParams({
            enseigne: creds.enseigne,
            magasin: creds.magasin,
            compte: creds.compte,
            motpasse: creds.motpasse,
            data: "SELECT COUNT(*) FROM Articles WHERE Actif = 1",
        });

        const res = await fetch(`${creds.baseUrl}/EDIQUERY.IPS`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
        });

        if (!res.ok) {
            return { ok: false, error: `Serveur Fastmag inaccessible (${res.status}). Vérifiez l'URL.` };
        }

        const text = await res.text();
        if (text.startsWith("KO|")) {
            const msg = text.slice(3).trim();
            if (msg.toLowerCase().includes("authentif") || msg.toLowerCase().includes("password") || msg.toLowerCase().includes("compte")) {
                return { ok: false, error: "Identifiants refusés. Vérifiez enseigne, magasin, compte et mot de passe." };
            }
            return { ok: false, error: `Erreur Fastmag : ${msg}` };
        }

        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Connexion impossible" };
    }
}

// ── EDI Query API ──────────────────────────────────────────────

async function fastmagQuery(
    creds: FastmagCredentials,
    sql: string,
): Promise<string> {
    const formData = new URLSearchParams({
        enseigne: creds.enseigne,
        magasin: creds.magasin,
        compte: creds.compte,
        motpasse: creds.motpasse,
        data: sql,
    });

    const res = await fetch(`${creds.baseUrl}/EDIQUERY.IPS`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
    });

    if (!res.ok) {
        throw new Error(`Fastmag EDI query error: ${res.status}`);
    }

    return res.text();
}

// ── BOA REST API ───────────────────────────────────────────────

async function fastmagBoaFetch<T = unknown>(
    creds: FastmagCredentials,
    path: string,
    params?: Record<string, string>,
): Promise<T> {
    const url = new URL(`${creds.baseUrl}/api/boa/${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
    }

    const res = await fetch(url.toString(), {
        headers: {
            Authorization: `Basic ${btoa(`${creds.compte}:${creds.motpasse}`)}`,
            "X-Fastmag-Enseigne": creds.enseigne,
            "X-Fastmag-Magasin": creds.magasin,
            "Content-Type": "application/json",
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Fastmag BOA error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
}

// ── EDI Response Parser ────────────────────────────────────────

// Fastmag EDI returns pipe-separated rows with {CR}{LF} line breaks
// First line: OK|count or KO|error_message
function parseEdiResponse(raw: string): string[][] {
    const lines = raw.replace(/\{CR\}\{LF\}/g, "\n").split("\n").filter(Boolean);
    if (lines.length === 0) return [];

    const header = lines[0];
    if (header.startsWith("KO|")) {
        throw new Error(`Fastmag EDI error: ${header.slice(3)}`);
    }

    // Skip header line (OK|count), parse data rows
    return lines.slice(1).map((line) => line.split("|"));
}

// ── EDI SQL Queries ────────────────────────────────────────────
// ⚠️ BEST-GUESS — these column names are derived from integrator code
// (HomeMade PrestaShop sync, nateev/fastmag lib, DQE connector docs).
// They WILL need adjustment once we have a real Fastmag test account.
// The EDI QUERY endpoint accepts SQL-like syntax targeting Fastmag's
// internal tables (Articles, Stock, etc.) via POST to EDIQUERY.IPS.

// Articles: reference, designation, code_barre, prix_ttc, famille, sous_famille, marque, photo_url
const ARTICLES_SQL = `SELECT a.Reference, a.Designation, a.CodeBarre, a.PrixTTC, a.Famille, a.SousFamille, a.Marque, a.ImageURL FROM Articles a WHERE a.Actif = 1 ORDER BY a.Reference`;

// Stock: reference, magasin, quantite
const STOCK_SQL = (refs: string[]) =>
    `SELECT s.Reference, s.Magasin, s.Quantite FROM Stock s WHERE s.Reference IN ('${refs.map(r => r.replace(/'/g, "''")).join("','")}')`;

// ── Adapter ────────────────────────────────────────────────────

export const fastmagAdapter: IPOSAdapter = {
    name: "fastmag",

    getAuthUrl(_merchantId: string): string {
        // Fastmag uses direct credential auth, not OAuth
        throw new Error("Fastmag does not use OAuth. Configure credentials in dashboard settings.");
    },

    async exchangeCode(_code: string) {
        throw new Error("Fastmag does not use OAuth. Configure credentials in dashboard settings.");
    },

    async refreshToken(_refreshToken: string) {
        return null;
    },

    async getCatalog(accessToken: string, _options?: POSAdapterOptions): Promise<POSProduct[]> {
        const creds = parseFastmagCredentials(accessToken);

        if (creds.useBoa) {
            return getCatalogBoa(creds);
        }
        return getCatalogEdi(creds);
    },

    async getStock(accessToken: string, itemIds: string[], _options?: POSAdapterOptions): Promise<POSStockUpdate[]> {
        if (itemIds.length === 0) return [];

        const creds = parseFastmagCredentials(accessToken);
        const updates: POSStockUpdate[] = [];

        // Batch by 100 references
        for (let i = 0; i < itemIds.length; i += 100) {
            const batch = itemIds.slice(i, i + 100);

            if (creds.useBoa) {
                const stockItems = await getStockBoa(creds, batch);
                updates.push(...stockItems);
            } else {
                const stockItems = await getStockEdi(creds, batch);
                updates.push(...stockItems);
            }
        }

        return updates;
    },

    async fetchPromos(_accessToken: string, _options?: POSAdapterOptions): Promise<POSPromo[]> {
        // Fastmag promos are complex (multi-level pricing, soldes, etc.)
        // Will implement when we have real API access to test
        return [];
    },

    verifyWebhook(_body: string, _signature: string): boolean {
        // Fastmag supports webhooks via Orisha Commerce — to implement with partnership
        return false;
    },

    parseWebhookEvent(_body: unknown): POSStockUpdate[] | null {
        return null;
    },

    async pushCatalog(_accessToken: string, _products: POSProduct[], _options?: POSAdapterOptions): Promise<void> {
        throw new Error("Fastmag pushCatalog not implemented — Two-Step reads only");
    },
};

// ── EDI Implementation ─────────────────────────────────────────

async function getCatalogEdi(creds: FastmagCredentials): Promise<POSProduct[]> {
    const raw = await fastmagQuery(creds, ARTICLES_SQL);
    const rows = parseEdiResponse(raw);

    return rows.map((cols) => ({
        pos_item_id: cols[0] || "", // reference
        name: cols[1] || "",        // designation
        ean: cols[2] && /^\d{12,13}$/.test(cols[2]) ? cols[2] : null, // code_barre
        price: cols[3] ? parseFloat(cols[3]) : null, // prix_ttc
        category: cols[5] || cols[4] || null,         // sous_famille or famille
        photo_url: cols[7] || null,                    // ImageURL
    }));
}

async function getStockEdi(creds: FastmagCredentials, refs: string[]): Promise<POSStockUpdate[]> {
    const raw = await fastmagQuery(creds, STOCK_SQL(refs));
    const rows = parseEdiResponse(raw);

    // Group by reference, sum quantities for the merchant's store
    const stockMap = new Map<string, number>();
    for (const cols of rows) {
        const ref = cols[0];
        const store = cols[1];
        const qty = parseInt(cols[2] || "0", 10);

        // Filter by merchant's store if specified, otherwise sum all
        if (creds.magasin && store !== creds.magasin) continue;
        stockMap.set(ref, (stockMap.get(ref) ?? 0) + qty);
    }

    return [...stockMap.entries()].map(([ref, qty]) => ({
        pos_item_id: ref,
        quantity: qty,
        updated_at: new Date().toISOString(),
    }));
}

// ── BOA REST Implementation ────────────────────────────────────

type BoaArticle = {
    reference: string;
    designation: string;
    codeBarre: string;
    prixTTC: number;
    famille: string;
    sousFamille: string;
    marque: string;
    imageUrl: string;
    actif: boolean;
};

type BoaStockItem = {
    reference: string;
    magasin: string;
    quantite: number;
};

async function getCatalogBoa(creds: FastmagCredentials): Promise<POSProduct[]> {
    const products: POSProduct[] = [];
    let page = 1;

    do {
        const data = await fastmagBoaFetch<{ articles: BoaArticle[]; hasMore: boolean }>(
            creds,
            "articles",
            { page: String(page), limit: "500", actif: "1" },
        );

        for (const article of data.articles ?? []) {
            products.push({
                pos_item_id: article.reference,
                name: article.designation,
                ean: article.codeBarre && /^\d{12,13}$/.test(article.codeBarre) ? article.codeBarre : null,
                price: article.prixTTC ?? null,
                category: article.sousFamille || article.famille || null,
                photo_url: article.imageUrl || null,
            });
        }

        if (!data.hasMore || (data.articles ?? []).length === 0) break;
        page++;
    } while (true);

    return products;
}

async function getStockBoa(creds: FastmagCredentials, refs: string[]): Promise<POSStockUpdate[]> {
    const data = await fastmagBoaFetch<{ stock: BoaStockItem[] }>(
        creds,
        "stock",
        { references: refs.join(","), magasin: creds.magasin },
    );

    return (data.stock ?? []).map((item) => ({
        pos_item_id: item.reference,
        quantity: item.quantite ?? 0,
        updated_at: new Date().toISOString(),
    }));
}

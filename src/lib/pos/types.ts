export type POSProduct = {
    pos_item_id: string;
    name: string;
    ean: string | null;
    price: number | null;
    category: string | null;
    photo_url: string | null;
};

export type POSStockUpdate = {
    pos_item_id: string;
    quantity: number;
    updated_at: string;
};

export type POSPromo = {
    pos_promo_id: string;
    name: string;
    type: "percentage" | "fixed_amount";
    value: number;
    product_ids: string[];
    starts_at: string | null;
    ends_at: string | null;
};

export interface IPOSAdapter {
    /** Nom du POS (square, lightspeed, shopify, sumup, zettle) */
    name: string;

    /** Génère l'URL d'autorisation OAuth */
    getAuthUrl(merchantId: string): string;

    /** Échange le code OAuth contre des tokens */
    exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string; expires_at: string }>;

    /** Rafraîchit un token expiré via refresh_token. Retourne null si non supporté. */
    refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_at: string } | null>;

    /** Récupère le catalogue complet du marchand */
    getCatalog(accessToken: string): Promise<POSProduct[]>;

    /** Récupère le stock actuel pour une liste de produits */
    getStock(accessToken: string, itemIds: string[]): Promise<POSStockUpdate[]>;

    /** Récupère les promos actives */
    fetchPromos(accessToken: string): Promise<POSPromo[]>;

    /** Vérifie la signature d'un webhook entrant */
    verifyWebhook(body: string, signature: string): boolean;

    /** Parse un événement webhook en mise à jour de stock */
    parseWebhookEvent(body: unknown): POSStockUpdate[] | null;

    /** Pousse les nouveaux produits dans le POS du commerçant */
    pushCatalog(accessToken: string, products: POSProduct[]): Promise<void>;
}

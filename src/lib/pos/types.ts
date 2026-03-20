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

export interface IPOSAdapter {
    /** Nom du POS (square, lightspeed, shopify) */
    name: string;

    /** Génère l'URL d'autorisation OAuth */
    getAuthUrl(merchantId: string): string;

    /** Échange le code OAuth contre des tokens */
    exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string; expires_at: string }>;

    /** Récupère le catalogue complet du marchand */
    getCatalog(accessToken: string): Promise<POSProduct[]>;

    /** Récupère le stock actuel pour une liste de produits */
    getStock(accessToken: string, itemIds: string[]): Promise<POSStockUpdate[]>;

    /** Vérifie la signature d'un webhook entrant */
    verifyWebhook(body: string, signature: string): boolean;

    /** Parse un événement webhook en mise à jour de stock */
    parseWebhookEvent(body: unknown): POSStockUpdate[] | null;

    /** Pousse les nouveaux produits dans le POS du commerçant */
    pushCatalog(accessToken: string, products: POSProduct[]): Promise<void>;
}

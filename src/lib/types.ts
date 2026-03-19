export type Merchant = {
    id: string;
    user_id: string;
    name: string;
    address: string;
    city: string;
    status: "pending" | "active" | "suspended";
    siret: string | null;
    phone: string | null;
    description: string | null;
    photo_url: string | null;
    opening_hours: Record<string, { open: string; close: string } | null> | null;
    pos_type: "square" | "sumup" | "zettle" | "clover" | "lightspeed" | null;
    pos_last_sync: string | null;
    created_at: string;
    updated_at: string;
};

export type MerchantPOSCredentials = {
    merchant_id: string;
    access_token: string;
    refresh_token: string | null;
    expires_at: string | null;
    extra: Record<string, unknown>;
    updated_at: string;
};

export type Product = {
    id: string;
    merchant_id: string;
    ean: string | null;
    name: string;
    description: string | null;
    category: string | null;
    price: number | null;
    photo_url: string | null;
    pos_item_id: string | null;
    created_at: string;
    updated_at: string;
};

export type Stock = {
    product_id: string;
    quantity: number;
    updated_at: string;
};

export type Promotion = {
    id: string;
    product_id: string;
    sale_price: number;
    starts_at: string;
    ends_at: string | null;
    created_at: string;
};

export type SearchResult = {
    product_id: string;
    product_name: string;
    product_price: number | null;
    product_photo: string | null;
    product_ean: string | null;
    stock_quantity: number;
    merchant_id: string;
    merchant_name: string;
    merchant_address: string;
    merchant_city: string;
    distance_km: number;
    sale_price: number | null;
    sale_ends_at: string | null;
};

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
    pos_type: "square" | "lightspeed" | "shopify" | null;
    pos_last_sync: string | null;
    plan: "free" | "standard" | "premium";
    free_until: string | null;
    launch_cohort: number | null;
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
    brand: string | null;
    purchase_price: number | null;
    category_auto: string | null;
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

export type Invoice = {
    id: string;
    merchant_id: string;
    source: "email" | "upload" | "einvoice";
    status: "received" | "extracting" | "parsed" | "validated" | "imported" | "failed";
    file_url: string | null;
    sender_email: string | null;
    supplier_name: string | null;
    received_at: string;
    parsed_at: string | null;
    validated_at: string | null;
};

export type InvoiceItem = {
    id: string;
    invoice_id: string;
    name: string;
    quantity: number;
    unit_price_ht: number | null;
    ean: string | null;
    status: "detected" | "enriched" | "validated" | "rejected";
    product_id: string | null;
    match_type: "exact_ean" | "exact_name" | "fuzzy" | null;
};

export type EmailConnection = {
    merchant_id: string;
    provider: "gmail" | "outlook" | "imap";
    email_address: string;
    last_sync_at: string | null;
    status: "active" | "expired" | "disconnected";
    created_at: string;
};

export type EanLookup = {
    ean: string;
    name: string;
    brand: string | null;
    photo_url: string | null;
    source: string;
    fetched_at: string;
};

export type FeedEvent = {
    id: string;
    merchant_id: string;
    product_id: string;
    event_type: "new_product" | "restock" | "price_drop" | "new_promo";
    created_at: string;
};

export type PlatformMetric = {
    key: string;
    value: number;
    updated_at: string;
};

export type FeedItem = {
    product_id: string;
    product_name: string;
    product_price: number | null;
    product_photo: string | null;
    product_ean: string | null;
    product_brand: string | null;
    stock_quantity: number;
    merchant_id: string;
    merchant_name: string;
    merchant_address: string;
    merchant_city: string;
    distance_km: number;
    event_type: string;
    event_created_at: string;
    feed_score: number;
};

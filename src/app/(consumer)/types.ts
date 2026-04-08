/**
 * Shared TypeScript types for consumer pages.
 * Derived from Supabase query shapes in the API routes.
 */

/** Shape returned by GET /api/discover, /api/products/discover, /api/search, etc. */
export interface ProductResult {
    product_id: string;
    product_name: string;
    product_price: number;
    product_photo: string | null;
    stock_quantity: number;
    merchant_id: string;
    merchant_name: string;
    merchant_photo?: string | null;
    distance_km: number;
    sale_price: number | null;
}

/**
 * Shape returned by GET /api/favorites.
 * Supabase query: user_favorites.select("*, products(*, stock(quantity), merchants(name, address, city))")
 */
export interface FavoriteItem {
    product_id: string;
    user_id: string;
    created_at: string;
    products: {
        id: string;
        name: string;
        canonical_name: string | null;
        price: number;
        photo_url: string | null;
        photo_processed_url: string | null;
        merchant_id: string;
        category: string | null;
        stock: { quantity: number }[];
        merchants: { name: string; address: string; city: string } | null;
    };
}

/**
 * Shape returned by GET /api/follows.
 * Supabase query: user_follows.select("*, merchants(name, description, photo_url, logo_url, city)")
 */
export interface FollowItem {
    merchant_id: string;
    user_id: string;
    created_at: string;
    merchants: {
        name: string;
        description: string | null;
        photo_url: string | null;
        logo_url: string | null;
        city: string | null;
    } | null;
}

/** Merchant shape from toulouse/[category] page Supabase join. */
export interface CategoryMerchant {
    id: string;
    slug: string;
    name: string;
    address: string;
    city: string;
    photo_url: string | null;
    logo_url: string | null;
}

/** Product with joined merchant from product/[id] page server query. */
export interface ProductWithMerchant {
    slug: string;
    name: string;
    canonical_name: string | null;
    price: number;
    photo_url: string | null;
    category: string | null;
    description: string | null;
    ean: string | null;
    merchant_id: string;
    merchants: {
        name: string;
        city: string;
        address: string;
        slug: string;
    } | null;
}

/** OpeningHoursSpecification for JSON-LD structured data. */
export interface OpeningHoursSpec {
    "@type": "OpeningHoursSpecification";
    dayOfWeek: string;
    opens: string;
    closes: string;
}

import type { Filters } from "../components/filter-panel";

export interface DiscoverProduct {
    product_id: string;
    product_name: string;
    product_price: number;
    product_photo: string | null;
    stock_quantity: number;
    merchant_id: string;
    merchant_name: string;
    merchant_photo: string | null;
    merchant_pos_type: string | null;
    distance_km: number;
    sale_price: number | null;
}

/** Append active filter params to a URLSearchParams instance */
export function appendFilterParams(params: URLSearchParams, filters: Filters) {
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.color) params.set("color", filters.color);
    if (filters.gender) params.set("gender", filters.gender);
    if (filters.priceMin != null) params.set("priceMin", String(filters.priceMin));
    if (filters.priceMax != null) params.set("priceMax", String(filters.priceMax));
}

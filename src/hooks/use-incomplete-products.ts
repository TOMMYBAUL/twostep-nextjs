"use client";

import { useCallback, useEffect, useState } from "react";

type IncompleteProduct = {
    id: string;
    name: string;
    category: string | null;
    price: number | null;
    photo_url: string | null;
    created_at: string;
};

export function useIncompleteProducts(merchantId: string | undefined) {
    const [products, setProducts] = useState<IncompleteProduct[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchProducts = useCallback(async () => {
        if (!merchantId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/products?merchant_id=${merchantId}&incomplete=true`);
            const data = await res.json();
            if (res.ok) setProducts(data.products ?? []);
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    }, [merchantId]);

    useEffect(() => { fetchProducts(); }, [fetchProducts]);

    return { products, loading, refetch: fetchProducts, count: products.length };
}

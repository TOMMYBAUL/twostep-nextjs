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
    // Honnêteté north-star (cf. écran Mon stock, Phase E) : un échec de chargement ne doit
    // PAS se déguiser en « 0 à compléter » silencieux (la pastille disparaît → un marchand
    // avec N fiches à compléter ne voit AUCUN signal). On expose l'échec au lieu de l'avaler.
    const [error, setError] = useState<string | null>(null);

    const fetchProducts = useCallback(async () => {
        if (!merchantId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/products?merchant_id=${merchantId}&incomplete=true`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setProducts(data.products ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load incomplete products");
        } finally {
            setLoading(false);
        }
    }, [merchantId]);

    useEffect(() => { fetchProducts(); }, [fetchProducts]);

    return { products, loading, error, refetch: fetchProducts, count: products.length };
}

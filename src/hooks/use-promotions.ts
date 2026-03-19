"use client";

import { useCallback, useEffect, useState } from "react";
import type { Promotion } from "@/lib/types";

type PromotionWithProduct = Promotion & {
    products: { name: string; price: number | null; photo_url: string | null; merchant_id: string };
};

export function usePromotions(merchantId: string | undefined) {
    const [promotions, setPromotions] = useState<PromotionWithProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPromotions = useCallback(async () => {
        if (!merchantId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await window.fetch(`/api/promotions?merchant_id=${merchantId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setPromotions(data.promotions ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load promotions");
        } finally {
            setLoading(false);
        }
    }, [merchantId]);

    useEffect(() => { fetchPromotions(); }, [fetchPromotions]);

    const createPromotion = async (body: { product_id: string; sale_price: number; starts_at?: string; ends_at?: string | null }) => {
        const res = await window.fetch("/api/promotions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetchPromotions();
        return data.promotion;
    };

    const deletePromotion = async (id: string) => {
        const res = await window.fetch(`/api/promotions/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetchPromotions();
    };

    return { promotions, loading, error, refetch: fetchPromotions, createPromotion, deletePromotion };
}

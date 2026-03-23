"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import { DEMO_MODE, demoProducts } from "@/lib/demo-data";

type ProductWithStock = Product & { stock: { quantity: number }[] };

export function useProducts(merchantId: string | undefined) {
    const [products, setProducts] = useState<ProductWithStock[]>(DEMO_MODE ? demoProducts : []);
    const [loading, setLoading] = useState(!DEMO_MODE);
    const [error, setError] = useState<string | null>(null);

    const fetchProducts = useCallback(async () => {
        if (DEMO_MODE) { setProducts(demoProducts); setLoading(false); return; }
        if (!merchantId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await window.fetch(`/api/products?merchant_id=${merchantId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setProducts(data.products ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load products");
        } finally {
            setLoading(false);
        }
    }, [merchantId]);

    useEffect(() => { fetchProducts(); }, [fetchProducts]);

    const createProduct = async (body: Record<string, unknown>) => {
        const res = await window.fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetchProducts();
        return data.product;
    };

    const updateProduct = async (id: string, body: Record<string, unknown>) => {
        const res = await window.fetch(`/api/products/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetchProducts();
        return data.product;
    };

    const deleteProduct = async (id: string) => {
        const res = await window.fetch(`/api/products/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetchProducts();
    };

    const updateStock = async (productId: string, delta?: number, quantity?: number) => {
        const body: Record<string, unknown> = { product_id: productId };
        if (delta !== undefined) body.delta = delta;
        if (quantity !== undefined) body.quantity = quantity;
        const res = await window.fetch("/api/stock", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetchProducts();
        return data.stock;
    };

    return { products, loading, error, refetch: fetchProducts, createProduct, updateProduct, deleteProduct, updateStock };
}

"use client";

import { useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StockBadge } from "@/components/dashboard/stock-badge";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";

export default function StockPage() {
    const { merchant } = useMerchant();
    const { products, loading, updateStock } = useProducts(merchant?.id);
    const { toast } = useToast();
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const totalProducts = products.length;
    const inStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) > 0).length;
    const lowStock = products.filter((p) => {
        const q = p.stock?.[0]?.quantity ?? 0;
        return q > 0 && q <= 5;
    }).length;
    const outOfStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) === 0).length;

    const handleDelta = async (productId: string, delta: number) => {
        setUpdatingId(productId);
        try {
            await updateStock(productId, delta);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setUpdatingId(null);
        }
    };

    const handleAbsolute = async (productId: string, value: string) => {
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 0) return;
        setUpdatingId(productId);
        try {
            await updateStock(productId, undefined, qty);
            toast("Stock mis à jour");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setUpdatingId(null);
        }
    };

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Gestion du"
                titleAccent="stock"
            />

            <div className="mb-8 grid grid-cols-4 gap-4">
                <MetricCard label="Total produits" value={totalProducts} staggerIndex={0} />
                <MetricCard label="En stock" value={inStock} staggerIndex={1} />
                <MetricCard label="Stock bas" value={lowStock} variant="warn" staggerIndex={2} />
                <MetricCard label="Ruptures" value={outOfStock} variant="danger" staggerIndex={3} />
            </div>

            {loading ? (
                <div className="flex flex-col gap-1.5">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse rounded-xl bg-white px-4 py-5" />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {products.map((product, i) => {
                        const qty = product.stock?.[0]?.quantity ?? 0;
                        return (
                            <div
                                key={product.id}
                                className={`animate-fade-up stagger-${Math.min(i + 5, 10)} flex items-center gap-4 rounded-xl bg-white px-5 py-3.5`}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-sm font-semibold text-gray-900">{product.name}</p>
                                    {product.category && <p className="text-xs text-gray-400">{product.category}</p>}
                                </div>

                                <StockBadge quantity={qty} />

                                {/* +/- buttons */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleDelta(product.id, -1)}
                                        disabled={updatingId === product.id || qty === 0}
                                        className="flex size-8 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                                    >
                                        −
                                    </button>
                                    <input
                                        type="number"
                                        min="0"
                                        defaultValue={qty}
                                        key={qty}
                                        onBlur={(e) => handleAbsolute(product.id, e.target.value)}
                                        className="w-16 rounded-lg bg-gray-50 px-2 py-1.5 text-center text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[var(--ts-accent)]/30"
                                    />
                                    <button
                                        onClick={() => handleDelta(product.id, 1)}
                                        disabled={updatingId === product.id}
                                        className="flex size-8 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductRow } from "@/components/dashboard/product-row";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";

export default function ProductsPage() {
    const { merchant } = useMerchant();
    const { products, loading } = useProducts(merchant?.id);
    const [search, setSearch] = useState("");

    const filtered = products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
    );

    const totalProducts = products.length;
    const inStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) > 0).length;
    const lowStock = products.filter((p) => {
        const q = p.stock?.[0]?.quantity ?? 0;
        return q > 0 && q <= 5;
    }).length;
    const outOfStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) === 0).length;

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Mes"
                titleAccent="produits"
                action={
                    <Link href="/dashboard/products/new" className="btn-ts no-underline">
                        + Ajouter un produit
                    </Link>
                }
            />

            {/* Metrics */}
            <div className="mb-8 grid grid-cols-4 gap-4">
                <MetricCard label="Total produits" value={totalProducts} staggerIndex={0} />
                <MetricCard label="En stock" value={inStock} staggerIndex={1} />
                <MetricCard label="Stock bas" value={lowStock} variant="warn" staggerIndex={2} />
                <MetricCard label="Ruptures" value={outOfStock} variant="danger" staggerIndex={3} />
            </div>

            {/* Search */}
            <div className="animate-fade-up stagger-5 mb-4 flex items-center justify-between">
                <input
                    type="text"
                    className="search-ts"
                    placeholder="Rechercher un produit..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Product list */}
            {loading ? (
                <div className="flex flex-col gap-1.5">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse rounded-xl bg-white px-4 py-5" />
                    ))}
                </div>
            ) : filtered.length === 0 && search === "" ? (
                <EmptyState
                    icon="📦"
                    title="Aucun produit encore"
                    description="Ajoutez votre premier produit pour commencer à le rendre visible."
                    action={
                        <Link href="/dashboard/products/new" className="btn-ts no-underline">
                            Ajouter mon premier produit
                        </Link>
                    }
                />
            ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Aucun résultat pour &quot;{search}&quot;</p>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {filtered.map((product, i) => (
                        <ProductRow
                            key={product.id}
                            id={product.id}
                            name={product.name}
                            category={product.category}
                            price={product.price}
                            stockQuantity={product.stock?.[0]?.quantity ?? 0}
                            photoUrl={product.photo_url}
                            staggerIndex={i}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

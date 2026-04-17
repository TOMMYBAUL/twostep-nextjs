"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductCard } from "../components/product-card";
import type { Filters } from "../components/filter-panel";
import type { DiscoverProduct } from "./types";

interface InfiniteProductGridProps {
    lat: number;
    lng: number;
    category: string | null;
    size: string | null;
    filters: Filters;
    favoriteIds: Set<string>;
    onToggleFav: (id: string) => void;
}

export function InfiniteProductGrid({
    lat, lng, category, size, filters, favoriteIds, onToggleFav,
}: InfiniteProductGridProps) {
    const [pages, setPages] = useState<DiscoverProduct[][]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [total, setTotal] = useState(0);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef(1);
    const loadingRef = useRef(false);
    const hasMoreRef = useRef(true);
    const categoryRef = useRef(category);
    const sizeRef = useRef(size);
    const filtersRef = useRef(filters);
    const [resetCount, setResetCount] = useState(0);

    // Reset when category, size, or filters change
    useEffect(() => {
        categoryRef.current = category;
        sizeRef.current = size;
        filtersRef.current = filters;
        setPages([]);
        pageRef.current = 1;
        hasMoreRef.current = true;
        setHasMore(true);
        setTotal(0);
        setResetCount((c) => c + 1);
    }, [category, size, filters]);

    // Stable loadMore — no state in dependencies
    const loadMore = useCallback(async () => {
        if (loadingRef.current || !hasMoreRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        try {
            const params = new URLSearchParams({
                lat: lat.toString(), lng: lng.toString(),
                page: pageRef.current.toString(), limit: "20",
            });
            if (categoryRef.current) params.set("category", categoryRef.current);
            if (sizeRef.current) params.set("size", sizeRef.current);
            const f = filtersRef.current;
            if (f.brand) params.set("brand", f.brand);
            if (f.color) params.set("color", f.color);
            if (f.gender) params.set("gender", f.gender);
            if (f.priceMin != null) params.set("priceMin", String(f.priceMin));
            if (f.priceMax != null) params.set("priceMax", String(f.priceMax));
            const res = await fetch(`/api/products/discover?${params}`);
            if (!res.ok) {
                hasMoreRef.current = false;
                setHasMore(false);
                return;
            }
            const data = await res.json();
            const items = data.products ?? [];
            if (items.length === 0) {
                hasMoreRef.current = false;
                setHasMore(false);
                return;
            }
            setPages((prev) => [...prev, items]);
            hasMoreRef.current = data.hasMore;
            setHasMore(data.hasMore);
            setTotal(data.total);
            pageRef.current += 1;
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [lat, lng]);

    // Observer — re-create on filter reset to re-trigger when sentinel is in view
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) loadMore(); },
            { threshold: 0.1 },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [loadMore, resetCount]);

    const allProducts = useMemo(() => {
        const seen = new Set<string>();
        return pages.flat().filter((p) => {
            if (seen.has(p.product_id)) return false;
            seen.add(p.product_id);
            return true;
        });
    }, [pages]);

    return (
        <section className="pb-20">
            <div className="px-4 pb-3 pt-6">
                <h2 className="font-[family-name:var(--font-archivo-black)] text-[17px] tracking-[-0.3px] text-primary">Tout près de toi</h2>
                {total > 0 && <p className="mt-0.5 font-[family-name:var(--font-inter)] text-[11px] text-tertiary">{total} produits disponibles</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 px-4 md:grid-cols-4 md:gap-4 md:px-6">
                {allProducts.map((p, i) => {
                    const isFav = favoriteIds.has(p.product_id);
                    return (
                        <ProductCard
                            key={p.product_id}
                            index={i % 20}
                            id={p.product_id}
                            name={p.product_name}
                            price={p.product_price}
                            photo={p.product_photo}
                            merchantName={p.merchant_name}
                            distance={p.distance_km}
                            stockQuantity={p.stock_quantity ?? 99}
                            merchantPosType={p.merchant_pos_type}
                            salePrice={p.sale_price}
                            isFavorite={isFav}
                            onToggleFavorite={() => onToggleFav(p.product_id)}
                        />
                    );
                })}
            </div>

            {/* Sentinel */}
            <div ref={sentinelRef} className="flex h-10 items-center justify-center">
                {loading && <p className="font-[family-name:var(--font-inter)] text-[12px] text-tertiary">Chargement...</p>}
                {!hasMore && !loading && allProducts.length > 0 && (
                    <p className="font-[family-name:var(--font-inter)] text-[12px] text-tertiary">Tu as tout vu</p>
                )}
            </div>
        </section>
    );
}

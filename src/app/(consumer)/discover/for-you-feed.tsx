"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "@untitledui/icons";
import Link from "next/link";
import { ProductCard } from "../components/product-card";
import type { DiscoverProduct } from "./types";
import type { FollowItem } from "../types";

interface ForYouFeedProps {
    follows: FollowItem[] | undefined;
    favoriteIds: Set<string>;
    onToggleFav: (id: string) => void;
    lat: number;
    lng: number;
}

export function ForYouFeed({ follows, favoriteIds, onToggleFav, lat, lng }: ForYouFeedProps) {
    const merchantIds = follows?.map((f) => f.merchant_id) ?? [];
    const followedSet = new Set(merchantIds);

    const { data: prefs } = useQuery<{ clothing_size: string | null; shoe_size: number | null }>({
        queryKey: ["consumer-preferences"],
        queryFn: async () => {
            const res = await fetch("/api/consumer/preferences");
            if (!res.ok) return { clothing_size: null, shoe_size: null };
            return res.json();
        },
        staleTime: 5 * 60_000,
    });

    const clothingSize = prefs?.clothing_size ?? null;
    const shoeSize = prefs?.shoe_size ?? null;
    const hasPrefs = clothingSize !== null || shoeSize !== null;

    // Section 1: products from followed shops, filtered to user's sizes
    const { data: products, isLoading } = useQuery<DiscoverProduct[]>({
        queryKey: ["for-you-products", merchantIds, clothingSize, shoeSize],
        queryFn: async () => {
            if (merchantIds.length === 0) return [];
            const params = new URLSearchParams({ merchant_ids: merchantIds.join(","), promo_first: "true" });
            if (clothingSize) params.set("clothing_size", clothingSize);
            if (shoeSize) params.set("shoe_size", String(shoeSize));
            const res = await fetch(`/api/products/by-merchants?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        enabled: merchantIds.length > 0 && hasPrefs,
        staleTime: 30_000,
    });

    // Section 2: suggestions from OTHER shops, same sizes
    const primarySize = clothingSize ?? (shoeSize ? String(shoeSize) : null);
    const secondarySize = clothingSize && shoeSize ? String(shoeSize) : null;

    const { data: suggestions } = useQuery<DiscoverProduct[]>({
        queryKey: ["for-you-suggestions", lat, lng, primarySize, secondarySize, merchantIds],
        queryFn: async () => {
            if (!primarySize) return [];
            const params1 = new URLSearchParams({ lat: String(lat), lng: String(lng), section: "nearby", radius: "10", size: primarySize });
            const res1 = await fetch(`/api/discover?${params1}`);
            const data1 = res1.ok ? await res1.json() : { products: [] };
            let items: DiscoverProduct[] = data1.products ?? [];

            if (secondarySize) {
                const params2 = new URLSearchParams({ lat: String(lat), lng: String(lng), section: "nearby", radius: "10", size: secondarySize });
                const res2 = await fetch(`/api/discover?${params2}`);
                const data2 = res2.ok ? await res2.json() : { products: [] };
                const seen = new Set(items.map((p) => p.product_id));
                for (const p of (data2.products ?? []) as DiscoverProduct[]) {
                    if (!seen.has(p.product_id)) items.push(p);
                }
            }

            return items.filter((p) => !followedSet.has(p.merchant_id));
        },
        enabled: hasPrefs,
        staleTime: 60_000,
    });

    const renderProductCard = (p: DiscoverProduct, i: number) => (
        <ProductCard
            key={p.product_id}
            index={i}
            id={p.product_id}
            name={p.product_name}
            price={p.product_price}
            photo={p.product_photo}
            merchantName={p.merchant_name}
            distance={p.distance_km}
            stockQuantity={p.stock_quantity}
            salePrice={p.sale_price}
            isFavorite={favoriteIds.has(p.product_id)}
            onToggleFavorite={() => onToggleFav(p.product_id)}
        />
    );

    if (!hasPrefs) {
        return (
            <div className="pb-24 pt-2">
                <Link href="/profile" className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-warning-secondary px-3.5 py-2.5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none">
                    <span className="text-[11px] font-medium text-warning-primary">Renseigne ta taille pour un feed personnalisé</span>
                    <ChevronRight className="size-3.5 text-warning-primary" aria-hidden="true" />
                </Link>
            </div>
        );
    }

    if (!follows || follows.length === 0) {
        return (
            <div className="pb-24 pt-2">
                {/* Size banner */}
                <div className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-brand-section_subtle px-3.5 py-2.5">
                    <span className="text-[11px] font-medium text-brand-secondary">Filtré pour toi</span>
                    <div className="flex gap-1.5">
                        {clothingSize && <span className="rounded-lg bg-brand-solid px-2 py-0.5 text-[10px] font-semibold text-white">{clothingSize}</span>}
                        {shoeSize && <span className="rounded-lg bg-brand-solid px-2 py-0.5 text-[10px] font-semibold text-white">{shoeSize}</span>}
                    </div>
                </div>

                {/* No follows — skip to suggestions */}
                {suggestions && suggestions.length > 0 && (
                    <>
                        <p className="mb-3 px-4 text-[13px] font-semibold text-primary">Autour de toi, à ta taille</p>
                        <div className="grid grid-cols-2 gap-3 px-4">
                            {suggestions.map(renderProductCard)}
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="pb-24 pt-2">
            {/* Size auto-filter banner */}
            <div className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-brand-section_subtle px-3.5 py-2.5">
                <span className="text-[11px] font-medium text-brand-secondary">Filtré pour toi</span>
                <div className="flex gap-1.5">
                    {clothingSize && <span className="rounded-lg bg-brand-solid px-2 py-0.5 text-[10px] font-semibold text-white">{clothingSize}</span>}
                    {shoeSize && <span className="rounded-lg bg-brand-solid px-2 py-0.5 text-[10px] font-semibold text-white">{shoeSize}</span>}
                </div>
            </div>

            {/* ── Section 1: Followed shops ── */}
            <p className="mb-3 px-4 text-[13px] font-semibold text-primary">Tes boutiques</p>

            {isLoading && (
                <div className="grid grid-cols-2 gap-3 px-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="aspect-[3/4] animate-pulse rounded-[10px] bg-secondary" />
                    ))}
                </div>
            )}

            {!isLoading && (!products || products.length === 0) && (
                <div className="px-4 pb-4 pt-2 text-center">
                    <p className="text-[12px] text-tertiary">Pas de produit dans ta taille chez tes boutiques suivies pour le moment</p>
                </div>
            )}

            {products && products.length > 0 && (
                <div className="grid grid-cols-2 gap-3 px-4">
                    {products.map(renderProductCard)}
                </div>
            )}

            {/* ── Section 2: Suggestions from other shops ── */}
            {suggestions && suggestions.length > 0 && (
                <>
                    <div className="mx-4 my-6 flex items-center gap-3">
                        <div className="h-px flex-1 bg-secondary_hover" />
                        <span className="text-[11px] font-medium text-tertiary">Suggestions</span>
                        <div className="h-px flex-1 bg-secondary_hover" />
                    </div>
                    <p className="mb-3 px-4 text-[13px] font-semibold text-primary">Autour de toi, à ta taille</p>
                    <div className="grid grid-cols-2 gap-3 px-4">
                        {suggestions.map(renderProductCard)}
                    </div>
                </>
            )}
        </div>
    );
}

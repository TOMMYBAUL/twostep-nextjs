"use client";

import { useMemo } from "react";
import { ChevronRight } from "@untitledui/icons";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "../components/product-card";
import { ProductCardSkeleton, PromoCardSkeleton } from "../components/feed-skeleton";
import { generateSlug } from "@/lib/slug";
import type { DiscoverProduct } from "./types";
import type { Filters } from "../components/filter-panel";
import type { FollowItem } from "../types";
import { InfiniteProductGrid } from "./infinite-product-grid";

interface ExplorerFeedProps {
    promos: DiscoverProduct[] | undefined;
    loadingPromos: boolean;
    trending: DiscoverProduct[] | undefined;
    loadingTrending: boolean;
    nearby: DiscoverProduct[] | undefined;
    follows: FollowItem[] | undefined;
    activeCategory: string | null;
    activeSize: string | null;
    lat: number;
    lng: number;
    filters: Filters;
    favoriteIds: Set<string>;
    onToggleFav: (id: string) => void;
}

export function ExplorerFeed({
    promos,
    loadingPromos,
    trending,
    loadingTrending,
    nearby,
    follows,
    activeCategory,
    activeSize,
    lat,
    lng,
    filters,
    favoriteIds,
    onToggleFav,
}: ExplorerFeedProps) {
    // Top 5 promos sorted by discount % (then distance)
    const topPromos = useMemo(() => {
        if (!promos || promos.length === 0) return [];
        return promos
            .filter((p) => p.sale_price && p.sale_price < p.product_price)
            .sort((a, b) => {
                const dA = (a.product_price - a.sale_price!) / a.product_price;
                const dB = (b.product_price - b.sale_price!) / b.product_price;
                return dB - dA || a.distance_km - b.distance_km;
            })
            .slice(0, 5);
    }, [promos]);

    // Featured shop: closest merchant from nearby products
    const featuredShop = useMemo(() => {
        if (!nearby || nearby.length === 0) return null;
        const first = nearby[0];
        return {
            merchant_id: first.merchant_id,
            merchant_name: first.merchant_name,
            merchant_photo: first.merchant_photo,
            distance_km: first.distance_km,
        };
    }, [nearby]);

    return (
        <>
            {/* ── 1. Promos du moment ── */}
            {(loadingPromos || topPromos.length > 0) && (
            <section>
                <div className="flex items-center justify-between px-4">
                    <h2 className="font-[family-name:var(--font-archivo-black)] text-[17px] tracking-[-0.3px] text-primary">Promos du moment</h2>
                    <Link href={`/search?filter=promos${activeCategory ? `&category=${activeCategory}` : ""}${activeSize ? `&size=${activeSize}` : ""}`} aria-label="Voir toutes les promos" className="flex items-center gap-0.5 font-[family-name:var(--font-barlow)] text-[13px] font-semibold text-brand-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                        Voir tout
                        <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Link>
                </div>

                {topPromos.length > 0 && (
                <div className="mt-3 flex flex-col gap-2.5 px-4">
                    {loadingPromos ? (
                        <PromoCardSkeleton index={0} />
                    ) : (<>
                        {topPromos.map((p) => (
                            <Link
                                key={`${p.product_id}-${p.merchant_id}`}
                                href={`/product/${generateSlug(p.product_name, p.product_id)}`}
                                className="flex items-center gap-3 rounded-[10px] bg-secondary p-2.5 transition duration-100 active:bg-secondary_hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            >
                                <div className="relative size-[76px] shrink-0 overflow-hidden rounded-lg bg-secondary_hover">
                                    {p.product_photo ? (
                                        <Image src={p.product_photo} alt={p.product_name} fill sizes="76px" className="object-cover" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center font-[family-name:var(--font-barlow)] text-lg font-light text-primary/15">{p.product_name.charAt(0)}</div>
                                    )}
                                    {/* Badge % */}
                                    <div className="absolute right-1 top-1 rounded-md bg-brand-solid px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                        −{Math.round(((p.product_price - p.sale_price!) / p.product_price) * 100)}%
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-[family-name:var(--font-barlow)] text-[13px] font-bold tracking-[-0.2px] text-primary">{p.product_name}</p>
                                    <p className="mt-0.5 truncate font-[family-name:var(--font-inter)] text-[11px] text-tertiary">
                                        {p.merchant_name} · {p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)}m` : `${p.distance_km.toFixed(1)}km`}
                                    </p>
                                    <div className="mt-1 flex items-baseline gap-1.5">
                                        <span className="font-[family-name:var(--font-barlow)] text-[13px] font-extrabold text-primary">{p.sale_price!.toFixed(2)} €</span>
                                        <span className="font-[family-name:var(--font-inter)] text-[11px] text-tertiary line-through">{p.product_price.toFixed(2)} €</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </>)}
                </div>
                )}
            </section>
            )}

            {/* ── 2. Tendances — 2×2 grid ── */}
            <section>
                <div className="flex items-center justify-between px-4">
                    <h2 className="font-[family-name:var(--font-archivo-black)] text-[17px] tracking-[-0.3px] text-primary">Tendances</h2>
                    <Link href={`/search?filter=trending${activeCategory ? `&category=${activeCategory}` : ""}${activeSize ? `&size=${activeSize}` : ""}`} aria-label="Voir toutes les tendances" className="flex items-center gap-0.5 font-[family-name:var(--font-barlow)] text-[13px] font-semibold text-brand-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                        Voir tout
                        <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Link>
                </div>

                <div className="mt-3 px-4">
                    {loadingTrending ? (
                        <div className="grid grid-cols-2 gap-3">
                            {[0, 1, 2, 3].map((i) => (
                                <ProductCardSkeleton key={i} index={i} />
                            ))}
                        </div>
                    ) : trending && trending.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                            {trending.slice(0, 4).map((p, i) => (
                                <ProductCard
                                    key={`${p.product_id}-${p.merchant_id}`}
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
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-[10px] bg-secondary px-4 py-10 text-center">
                            <p className="font-[family-name:var(--font-inter)] text-[13px] text-tertiary">Rien pour le moment</p>
                        </div>
                    )}
                </div>
            </section>

            {/* ── 3. Boutique à découvrir ── */}
            {featuredShop && (
                <section className="px-4">
                    <h2 className="font-[family-name:var(--font-archivo-black)] text-[17px] tracking-[-0.3px] text-primary">Boutique à découvrir</h2>

                    <Link
                        href={`/shop/${generateSlug(featuredShop.merchant_name, featuredShop.merchant_id)}`}
                        className="mt-3 flex items-center gap-3 rounded-[10px] bg-secondary px-3.5 py-3 transition duration-100 active:bg-secondary_hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-secondary_hover font-[family-name:var(--font-barlow)] text-sm font-bold text-brand-secondary">
                            {featuredShop.merchant_photo ? (
                                <Image src={featuredShop.merchant_photo} alt={featuredShop.merchant_name} width={40} height={40} className="h-full w-full object-cover" />
                            ) : (
                                featuredShop.merchant_name.charAt(0)
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-[family-name:var(--font-barlow)] text-[13px] font-bold text-primary">{featuredShop.merchant_name}</p>
                            <p className="font-[family-name:var(--font-inter)] text-[11px] text-tertiary">
                                À {featuredShop.distance_km < 1 ? `${Math.round(featuredShop.distance_km * 1000)}m` : `${featuredShop.distance_km.toFixed(1)}km`} de toi
                            </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-0.5 font-[family-name:var(--font-barlow)] text-[13px] font-semibold text-brand-secondary">
                            Voir
                            <ChevronRight className="size-3.5" aria-hidden="true" />
                        </span>
                    </Link>
                </section>
            )}

            {/* ── 4. Tes boutiques (followed shops) ── */}
            {follows && follows.length > 0 && (
                <section className="px-4">
                    <h2 className="font-[family-name:var(--font-archivo-black)] text-[17px] tracking-[-0.3px] text-primary">Tes boutiques</h2>
                    <div className="mt-3 flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
                        {follows.map((f) => {
                            const merchant = f.merchants;
                            if (!merchant) return null;
                            return (
                                <Link
                                    key={f.merchant_id}
                                    href={`/shop/${generateSlug(merchant.name || "", f.merchant_id)}`}
                                    className="flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-xl focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                >
                                    <div className="relative size-14 overflow-hidden rounded-full bg-secondary ring-2 ring-brand/20">
                                        {merchant.photo_url ? (
                                            <Image src={merchant.photo_url} alt={merchant.name} fill sizes="56px" className="object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center font-[family-name:var(--font-barlow)] text-base font-bold text-brand-secondary">
                                                {merchant.name.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    <span className="w-full truncate text-center font-[family-name:var(--font-inter)] text-[10px] font-medium text-quaternary">
                                        {merchant.name}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ── 5. Tout près de toi — infinite scroll ── */}
            <InfiniteProductGrid lat={lat} lng={lng} category={activeCategory} size={activeSize} filters={filters} favoriteIds={favoriteIds} onToggleFav={onToggleFav} />
        </>
    );
}

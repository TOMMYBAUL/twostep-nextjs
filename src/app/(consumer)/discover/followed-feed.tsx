"use client";

import { useQuery } from "@tanstack/react-query";
import { Building07 } from "@untitledui/icons";
import Image from "next/image";
import Link from "next/link";
import { generateSlug } from "@/lib/slug";
import { HeartButton } from "../components/heart-button";
import type { DiscoverProduct } from "./types";
import type { FollowItem } from "../types";

interface FollowedFeedProps {
    follows: FollowItem[] | undefined;
    favoriteIds: Set<string>;
    onToggleFav: (id: string) => void;
    category: string | null;
    size: string | null;
}

export function FollowedFeed({ follows, favoriteIds, onToggleFav, category, size }: FollowedFeedProps) {
    const merchantIds = follows?.map((f) => f.merchant_id) ?? [];

    const { data: products, isLoading } = useQuery<DiscoverProduct[]>({
        queryKey: ["followed-products", merchantIds, category, size],
        queryFn: async () => {
            if (merchantIds.length === 0) return [];
            const params = new URLSearchParams({ merchant_ids: merchantIds.join(",") });
            if (category) params.set("category", category);
            if (size) params.set("size", size);
            const res = await fetch(`/api/products/by-merchants?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        enabled: merchantIds.length > 0,
        staleTime: 30_000,
    });

    if (!follows || follows.length === 0) {
        return (
            <div className="flex flex-col items-center px-6 pb-24 pt-12 text-center">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-secondary" aria-hidden="true"><Building07 className="size-7 text-tertiary" /></div>
                <p className="mt-4 text-[15px] font-semibold text-primary">Aucune boutique suivie</p>
                <p className="mt-1.5 text-[13px] text-tertiary">
                    Abonne-toi à des boutiques pour les retrouver ici.
                </p>
                <Link
                    href="/explore"
                    className="mt-4 rounded-full bg-brand-solid px-5 py-2.5 text-sm font-semibold text-white transition active:opacity-80 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                    Explorer les boutiques
                </Link>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 gap-3 px-4 pb-24 pt-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-[3/4] animate-pulse rounded-[10px] bg-secondary" />
                ))}
            </div>
        );
    }

    if (!products || products.length === 0) {
        return (
            <div className="flex flex-col items-center px-6 pb-24 pt-12 text-center">
                <p className="text-[15px] font-semibold text-primary">Rien de nouveau</p>
                <p className="mt-1.5 text-[13px] text-tertiary">
                    Les boutiques que tu suis n'ont pas encore de produits.
                </p>
            </div>
        );
    }

    return (
        <div className="pb-24 pt-4">
            {products.map((p) => {
                const isFav = favoriteIds.has(p.product_id);
                return (
                    <div key={p.product_id} className="px-4 pb-5">
                        {/* Full-width card — Instagram feed style */}
                        <Link href={`/product/${generateSlug(p.product_name, p.product_id)}`} className="group block rounded-[10px] transition duration-100 motion-reduce:transform-none active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none">
                            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[10px] bg-secondary">
                                {p.product_photo ? (
                                    <Image src={p.product_photo} alt={p.product_name} fill sizes="100vw" className="object-cover transition duration-300 motion-reduce:transform-none group-hover:scale-[1.03]" />
                                ) : (
                                    <div className="flex h-full items-center justify-center">
                                        <span className="font-[family-name:var(--font-barlow)] text-3xl font-light text-primary/15">{p.product_name.charAt(0)}</span>
                                    </div>
                                )}
                                <div className="absolute right-2.5 top-2.5">
                                    <HeartButton
                                        isFavorite={isFav}
                                        onToggle={() => onToggleFav(p.product_id)}
                                        ariaLabel={`${isFav ? "Retirer" : "Ajouter"} ${p.product_name} des favoris`}
                                    />
                                </div>
                                {p.sale_price && (
                                    <div className="absolute left-2.5 top-2.5 rounded-md bg-brand-solid px-1.5 py-0.5 font-[family-name:var(--font-barlow)] text-[11px] font-semibold text-white">
                                        -{Math.round(((p.product_price - p.sale_price) / p.product_price) * 100)}%
                                    </div>
                                )}
                            </div>
                        </Link>

                        {/* Product info — merchant avatar + details */}
                        <div className="mt-2.5 flex items-start gap-2.5">
                            <Link
                                href={`/shop/${generateSlug(p.merchant_name, p.merchant_id)}`}
                                className="mt-0.5 shrink-0 rounded-full transition active:opacity-70 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            >
                                <div className="size-8 overflow-hidden rounded-full bg-secondary">
                                    {p.merchant_photo ? (
                                        <Image src={p.merchant_photo} alt={p.merchant_name} width={32} height={32} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center font-[family-name:var(--font-barlow)] text-[10px] font-bold text-brand-secondary">
                                            {p.merchant_name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                            </Link>

                            <div className="min-w-0 flex-1">
                                <p className="truncate font-[family-name:var(--font-barlow)] text-[14px] font-bold tracking-[-0.2px] text-primary">{p.product_name}</p>
                                <p className="mt-0.5 font-[family-name:var(--font-inter)] text-[11px] text-tertiary">
                                    {p.merchant_name} · {p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)}m` : `${p.distance_km.toFixed(1)}km`}
                                </p>
                                <div className="mt-0.5 flex items-baseline gap-1.5">
                                    {p.sale_price ? (
                                        <>
                                            <span className="font-[family-name:var(--font-barlow)] text-[13px] font-extrabold text-primary">{p.sale_price.toFixed(2)} €</span>
                                            <span className="font-[family-name:var(--font-inter)] text-[11px] text-tertiary line-through">{p.product_price.toFixed(2)} €</span>
                                        </>
                                    ) : (
                                        <span className="font-[family-name:var(--font-barlow)] text-[13px] font-extrabold text-primary">{p.product_price.toFixed(2)} €</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

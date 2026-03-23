"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tag01, TrendUp01, ShoppingBag01, ChevronRight, MarkerPin01, Heart } from "@untitledui/icons";
import Link from "next/link";
import { ProductCard } from "../components/product-card";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useFollows } from "../hooks/use-follows";
import { useGeolocation } from "../hooks/use-geolocation";
import { cx } from "@/utils/cx";

interface DiscoverProduct {
    product_id: string;
    product_name: string;
    product_price: number;
    product_photo: string | null;
    stock_quantity: number;
    merchant_id: string;
    merchant_name: string;
    distance_km: number;
    sale_price: number | null;
}

const CATEGORIES = [
    { label: "Tout", value: null },
    { label: "Mode", value: "mode" },
    { label: "Chaussures", value: "chaussures" },
    { label: "Tech", value: "tech" },
    { label: "Bijoux", value: "bijoux" },
    { label: "Beauté", value: "beaute" },
    { label: "Sport", value: "sport" },
    { label: "Maison", value: "maison" },
    { label: "Jouets", value: "jouets" },
    { label: "Accessoires", value: "accessoires" },
    { label: "Bricolage", value: "bricolage" },
] as const;

function useDiscoverFeed(lat: number, lng: number, section: "promos" | "trending" | "nearby", category: string | null) {
    return useQuery<DiscoverProduct[]>({
        queryKey: ["discover", section, lat, lng, category],
        queryFn: async () => {
            const params = new URLSearchParams({
                lat: lat.toString(),
                lng: lng.toString(),
                section,
                radius: "10",
            });
            if (category) params.set("category", category);
            const res = await fetch(`/api/discover?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        staleTime: 30_000,
    });
}

export default function DiscoverPage() {
    const { position } = useGeolocation();
    const lat = position?.lat ?? 43.6047;
    const lng = position?.lng ?? 1.4442;
    const [activeCategory, setActiveCategory] = useState<string | null>(null);

    const { data: promos, isLoading: loadingPromos } = useDiscoverFeed(lat, lng, "promos", activeCategory);
    const { data: trending, isLoading: loadingTrending } = useDiscoverFeed(lat, lng, "trending", activeCategory);
    const { data: nearby, isLoading: loadingNearby } = useDiscoverFeed(lat, lng, "nearby", activeCategory);

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();
    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);
    const { data: follows } = useFollows();

    const toggleFav = (id: string) => {
        if (favoriteIds.has(id)) remove.mutate(id);
        else add.mutate(id);
    };

    return (
        <div className="min-h-dvh bg-[#2C1A0E]">
            {/* Header */}
            <div className="px-4 pb-3 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div>
                    <div className="flex items-center gap-2">
                        <img src="/logo-icon.webp" alt="" className="size-7" />
                        <h1 className="font-display text-2xl font-bold text-[#F5EDD8]">
                            Two-Step
                        </h1>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-[#F5EDD8]/50">
                        <MarkerPin01 className="size-3" aria-hidden="true" />
                        {position ? "Autour de toi" : "Toulouse"}
                    </p>
                </div>

                {/* Category chips */}
                <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.label}
                            type="button"
                            onClick={() => setActiveCategory(cat.value)}
                            className={cx(
                                "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition duration-150",
                                activeCategory === cat.value
                                    ? "bg-[#C17B2F] text-white shadow-sm"
                                    : "bg-[#3D2A1A] text-[#F5EDD8]/60",
                            )}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Feed sections */}
            <div className="flex flex-col gap-6 pb-24 pt-5">
                {/* Promos */}
                <FeedSection
                    icon={<Tag01 className="size-4" />}
                    iconColor="bg-[#C17B2F]/15 text-[#C17B2F]"
                    title="Promos du moment"
                    subtitle="Les bons plans près de chez toi"
                    seeAllHref="/search?filter=promos"
                    products={promos}
                    isLoading={loadingPromos}
                    favoriteIds={favoriteIds}
                    onToggleFavorite={toggleFav}
                />

                {/* Trending */}
                <FeedSection
                    icon={<TrendUp01 className="size-4" />}
                    iconColor="bg-[#F5EDD8]/10 text-[#F5EDD8]/70"
                    title="Tendances"
                    subtitle="Ce qui se vend le plus dans ton quartier"
                    products={trending}
                    isLoading={loadingTrending}
                    favoriteIds={favoriteIds}
                    onToggleFavorite={toggleFav}
                />

                {/* Nearby */}
                <FeedSection
                    icon={<ShoppingBag01 className="size-4" />}
                    iconColor="bg-[var(--ts-sage)]/15 text-[var(--ts-sage)]"
                    title="Disponible maintenant"
                    subtitle="En boutique aujourd'hui"
                    products={nearby}
                    isLoading={loadingNearby}
                    favoriteIds={favoriteIds}
                    onToggleFavorite={toggleFav}
                />

                {/* Followed shops */}
                {follows && follows.length > 0 && (
                    <section className="px-4">
                        <SectionHeader
                            icon={<Heart className="size-4" />}
                            iconColor="bg-[#C17B2F]/15 text-[#C17B2F]"
                            title="Tes boutiques"
                            subtitle="Les dernières nouveautés de tes favoris"
                        />
                        <div className="mt-3 flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                            {follows.map((f: any) => {
                                const merchant = f.merchants;
                                if (!merchant) return null;
                                return (
                                    <Link
                                        key={f.merchant_id}
                                        href={`/shop/${f.merchant_id}`}
                                        className="flex w-20 shrink-0 flex-col items-center gap-1.5"
                                    >
                                        <div className="size-16 overflow-hidden rounded-full bg-[#3D2A1A] shadow-sm ring-2 ring-[#C17B2F]/30">
                                            {merchant.photo_url ? (
                                                <img src={merchant.photo_url} alt={merchant.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-lg font-bold text-[#C17B2F]">
                                                    {merchant.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <span className="w-full truncate text-center text-[11px] font-medium text-[#F5EDD8]/70">
                                            {merchant.name}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

/* ── Section header ── */
function SectionHeader({
    icon,
    iconColor,
    title,
    subtitle,
    seeAllHref,
}: {
    icon: React.ReactNode;
    iconColor: string;
    title: string;
    subtitle: string;
    seeAllHref?: string;
}) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
                <div className={cx("flex size-8 items-center justify-center rounded-xl", iconColor)}>
                    {icon}
                </div>
                <div>
                    <h2 className="text-sm font-bold text-[#F5EDD8]">{title}</h2>
                    <p className="text-[11px] text-[#F5EDD8]/40">{subtitle}</p>
                </div>
            </div>
            {seeAllHref && (
                <Link href={seeAllHref} className="flex items-center gap-0.5 text-xs font-semibold text-[#C17B2F]">
                    Voir tout
                    <ChevronRight className="size-3.5" />
                </Link>
            )}
        </div>
    );
}

/* ── Feed section with horizontal scroll ── */
function FeedSection({
    icon,
    iconColor,
    title,
    subtitle,
    seeAllHref,
    products,
    isLoading,
    favoriteIds,
    onToggleFavorite,
}: {
    icon: React.ReactNode;
    iconColor: string;
    title: string;
    subtitle: string;
    seeAllHref?: string;
    products?: DiscoverProduct[];
    isLoading: boolean;
    favoriteIds: Set<string>;
    onToggleFavorite: (id: string) => void;
}) {
    return (
        <section>
            <div className="px-4">
                <SectionHeader icon={icon} iconColor={iconColor} title={title} subtitle={subtitle} seeAllHref={seeAllHref} />
            </div>

            {isLoading ? (
                <div className="mt-3 flex gap-3 overflow-x-auto px-4 scrollbar-hide">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="aspect-[3/4] w-40 shrink-0 animate-pulse rounded-lg bg-[#3D2A1A]" />
                    ))}
                </div>
            ) : products && products.length > 0 ? (
                <div className="mt-3 flex gap-3 overflow-x-auto px-4 scrollbar-hide pb-1">
                    {products.map((p) => (
                        <ProductCard
                            key={`${p.product_id}-${p.merchant_id}`}
                            id={p.product_id}
                            name={p.product_name}
                            price={p.product_price}
                            photo={p.product_photo}
                            merchantName={p.merchant_name}
                            distance={p.distance_km}
                            stockQuantity={p.stock_quantity}
                            salePrice={p.sale_price}
                            isFavorite={favoriteIds.has(p.product_id)}
                            onToggleFavorite={() => onToggleFavorite(p.product_id)}
                            className="w-44 shrink-0"
                        />
                    ))}
                </div>
            ) : (
                <div className="mx-4 mt-3 rounded-lg border border-[#3D2A1A] px-4 py-8 text-center">
                    <p className="text-xs font-medium text-[#F5EDD8]/30">Rien pour le moment — ça arrive vite.</p>
                </div>
            )}
        </section>
    );
}

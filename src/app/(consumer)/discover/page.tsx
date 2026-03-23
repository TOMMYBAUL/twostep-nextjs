"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tag01, TrendUp01, ShoppingBag01, ChevronRight, MarkerPin01 } from "@untitledui/icons";
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
    { label: "Tech", value: "tech" },
    { label: "Sport", value: "sport" },
    { label: "Maison", value: "maison" },
    { label: "Beauté", value: "beaute" },
] as const;

function useDiscoverFeed(lat: number, lng: number, section: "promos" | "trending" | "nearby") {
    return useQuery<DiscoverProduct[]>({
        queryKey: ["discover", section, lat, lng],
        queryFn: async () => {
            const params = new URLSearchParams({
                lat: lat.toString(),
                lng: lng.toString(),
                section,
                radius: "10",
            });
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

    const { data: promos, isLoading: loadingPromos } = useDiscoverFeed(lat, lng, "promos");
    const { data: trending, isLoading: loadingTrending } = useDiscoverFeed(lat, lng, "trending");
    const { data: nearby, isLoading: loadingNearby } = useDiscoverFeed(lat, lng, "nearby");

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();
    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);
    const { data: follows } = useFollows();

    const toggleFav = (id: string) => {
        if (favoriteIds.has(id)) remove.mutate(id);
        else add.mutate(id);
    };

    return (
        <div className="min-h-dvh bg-[var(--ts-cream)]">
            {/* Header */}
            <div className="bg-white px-4 pb-3 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="font-display text-2xl font-bold text-[var(--ts-brown)]">
                            Two-Step
                        </h1>
                        <p className="flex items-center gap-1 text-xs text-[var(--ts-brown-mid)]/60">
                            <MarkerPin01 className="size-3" aria-hidden="true" />
                            {position ? "Autour de toi" : "Toulouse"}
                        </p>
                    </div>
                    <img src="/logo-horizontal.png" alt="" className="h-7 opacity-60" />
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
                                    ? "bg-[var(--ts-ochre)] text-white shadow-sm"
                                    : "bg-[var(--ts-cream)] text-[var(--ts-brown-mid)]",
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
                    iconColor="bg-[var(--ts-red)]/10 text-[var(--ts-red)]"
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
                    iconColor="bg-[var(--ts-ochre)]/10 text-[var(--ts-ochre)]"
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
                            iconColor="bg-[var(--ts-red)]/10 text-[var(--ts-red)]"
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
                                        <div className="size-16 overflow-hidden rounded-full bg-white shadow-sm ring-2 ring-[var(--ts-cream-dark)]">
                                            {merchant.photo_url ? (
                                                <img src={merchant.photo_url} alt={merchant.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-lg font-bold text-[var(--ts-ochre)]">
                                                    {merchant.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <span className="w-full truncate text-center text-[11px] font-medium text-[var(--ts-brown)]">
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

/* ── Heart import for followed shops ── */
import { Heart } from "@untitledui/icons";

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
                    <h2 className="text-sm font-bold text-[var(--ts-brown)]">{title}</h2>
                    <p className="text-[11px] text-[var(--ts-brown-mid)]/50">{subtitle}</p>
                </div>
            </div>
            {seeAllHref && (
                <Link href={seeAllHref} className="flex items-center gap-0.5 text-xs font-semibold text-[var(--ts-ochre)]">
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
                        <div key={i} className="aspect-[3/4] w-40 shrink-0 animate-pulse rounded-2xl bg-white" />
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
                <div className="mx-4 mt-3 rounded-2xl bg-white px-4 py-8 text-center">
                    <p className="text-xs font-medium text-[var(--ts-brown-mid)]/40">Rien pour le moment — ça arrive vite.</p>
                </div>
            )}
        </section>
    );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Tag01, TrendUp01, ChevronRight, MarkerPin01, Heart, Bell01, FilterLines } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "../components/product-card";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useFollows } from "../hooks/use-follows";
import { generateSlug } from "@/lib/slug";
import { useGeolocation } from "../hooks/use-geolocation";
import { cx } from "@/utils/cx";
import { HeartButton } from "../components/heart-button";

interface DiscoverProduct {
    product_id: string;
    product_name: string;
    product_price: number;
    product_photo: string | null;
    stock_quantity: number;
    merchant_id: string;
    merchant_name: string;
    merchant_photo: string | null;
    distance_km: number;
    sale_price: number | null;
}

const CATEGORIES = [
    { label: "Tout", value: null, emoji: null },
    { label: "Mode", value: "mode", emoji: "👗" },
    { label: "Chaussures", value: "chaussures", emoji: "👟" },
    { label: "Bijoux", value: "bijoux", emoji: "💎" },
    { label: "Beauté", value: "beaute", emoji: "💄" },
    { label: "Sport", value: "sport", emoji: "⚽" },
    { label: "Déco", value: "deco", emoji: "🏠" },
    { label: "Épicerie", value: "epicerie", emoji: "🧺" },
] as const;

function useDiscoverFeed(lat: number, lng: number, section: "promos" | "trending" | "nearby", category: string | null, size: string | null) {
    return useQuery<DiscoverProduct[]>({
        queryKey: ["discover", section, lat, lng, category, size],
        queryFn: async () => {
            const params = new URLSearchParams({
                lat: lat.toString(),
                lng: lng.toString(),
                section,
                radius: "10",
            });
            if (category) params.set("category", category);
            if (size) params.set("size", size);
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
    const [sizeFilter, setSizeFilter] = useState<string | null>(null);
    const [shoeSizeFilter, setShoeSizeFilter] = useState<number | null>(null);
    const [showSizeFilters, setShowSizeFilters] = useState(false);
    const hasActiveSizeFilter = sizeFilter !== null || shoeSizeFilter !== null;
    const [feedTab, setFeedTab] = useState<"pour-toi" | "suivis">("pour-toi");

    const activeSize = sizeFilter ?? (shoeSizeFilter ? String(shoeSizeFilter) : null);
    const { data: promos, isLoading: loadingPromos } = useDiscoverFeed(lat, lng, "promos", activeCategory, activeSize);
    const { data: trending, isLoading: loadingTrending } = useDiscoverFeed(lat, lng, "trending", activeCategory, activeSize);
    const { data: nearby, isLoading: loadingNearby } = useDiscoverFeed(lat, lng, "nearby", activeCategory, activeSize);

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();
    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);
    const { data: follows } = useFollows();

    const toggleFav = (id: string) => {
        if (favoriteIds.has(id)) remove.mutate(id);
        else add.mutate(id);
    };

    // Hero promo: pick product with highest discount %
    const heroPromo = useMemo(() => {
        if (!promos || promos.length === 0) return null;
        return promos.reduce((best, p) => {
            if (!p.sale_price) return best;
            const discount = (p.product_price - p.sale_price) / p.product_price;
            const bestDiscount = best?.sale_price ? (best.product_price - best.sale_price) / best.product_price : 0;
            return discount > bestDiscount ? p : best;
        }, promos.find((p) => p.sale_price) ?? null);
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
        <div className="min-h-dvh bg-[#1C1209]" style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif" }}>
            {/* ── Header ── */}
            <div className="px-4 pb-3 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Image src="/logo-icon.webp" alt="" width={28} height={28} className="size-7" />
                            <h1 className="font-display text-2xl font-bold text-[#f5deb3]">
                                Two-Step
                            </h1>
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-[#a07840]">
                            <MarkerPin01 className="size-3" aria-hidden="true" />
                            {position ? "Autour de toi" : "Toulouse"}
                        </p>
                    </div>
                    <Link
                        href="/profile/notifications"
                        className="mt-1 flex size-[30px] items-center justify-center rounded-full bg-[#2a1a08] transition active:bg-[#3d2008]"
                    >
                        <Bell01 className="size-4 text-[#a07840]" />
                    </Link>
                </div>

                {/* ── Category pills with emoji + size filter button ── */}
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {/* Size filter toggle */}
                    <button
                        type="button"
                        onClick={() => setShowSizeFilters((v) => !v)}
                        className={cx(
                            "flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold transition duration-150",
                            hasActiveSizeFilter || showSizeFilters
                                ? "bg-[#c87830] text-[#1C1209] shadow-sm"
                                : "bg-[#2a1a08] text-[#f5deb3]/60",
                        )}
                    >
                        <FilterLines className="size-3.5" />
                        Taille
                        {hasActiveSizeFilter && (
                            <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-[#1C1209]/20 text-[9px]">
                                {(sizeFilter ? 1 : 0) + (shoeSizeFilter ? 1 : 0)}
                            </span>
                        )}
                    </button>

                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.label}
                            type="button"
                            onClick={() => setActiveCategory(cat.value)}
                            className={cx(
                                "flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-xs font-semibold transition duration-150",
                                activeCategory === cat.value
                                    ? "bg-[#c87830] text-[#1C1209] shadow-sm"
                                    : "bg-[#2a1a08] text-[#f5deb3]/60",
                            )}
                        >
                            {cat.emoji && <span className="text-xs">{cat.emoji}</span>}
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* ── Size filter panel ── */}
                <AnimatePresence>
                    {showSizeFilters && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-3 rounded-xl border-[0.5px] border-[#3d2a10] bg-[#2a1a08] p-3">
                                {/* Clothing size */}
                                <p className="mb-2 text-[11px] font-medium text-[#a07840]">Taille vêtements</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {(["XS", "S", "M", "L", "XL", "XXL"] as const).map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setSizeFilter(sizeFilter === s ? null : s)}
                                            className={cx(
                                                "rounded-lg px-3 py-1.5 text-[11px] font-medium transition duration-100",
                                                sizeFilter === s
                                                    ? "bg-[#c87830] text-[#1C1209]"
                                                    : "bg-[#1C1209] text-[#f5deb3]/60",
                                            )}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>

                                {/* Shoe size */}
                                <p className="mb-2 mt-3 text-[11px] font-medium text-[#a07840]">Pointure</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {([35, 35.5, 36, 36.5, 37, 37.5, 38, 38.5, 39, 39.5, 40, 40.5, 41, 41.5, 42, 42.5, 43, 43.5, 44, 44.5, 45, 45.5, 46, 46.5, 47] as const).map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setShoeSizeFilter(shoeSizeFilter === s ? null : s)}
                                            className={cx(
                                                "rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition duration-100",
                                                shoeSizeFilter === s
                                                    ? "bg-[#c87830] text-[#1C1209]"
                                                    : "bg-[#1C1209] text-[#f5deb3]/60",
                                            )}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>

                                {/* Reset */}
                                {hasActiveSizeFilter && (
                                    <button
                                        type="button"
                                        onClick={() => { setSizeFilter(null); setShoeSizeFilter(null); }}
                                        className="mt-2.5 text-[11px] font-medium text-[#c87830]"
                                    >
                                        Réinitialiser les filtres
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Pour toi / Suivis toggle ── */}
            <div className="mt-3 flex justify-center px-4">
                <div className="flex rounded-full p-1" style={{ background: "#2a1a08" }}>
                    <button
                        type="button"
                        onClick={() => setFeedTab("pour-toi")}
                        className={cx(
                            "rounded-full px-5 py-2 text-sm font-semibold transition duration-150",
                            feedTab === "pour-toi" ? "bg-[#C17B2F] text-white" : "text-[#f0dfc0]/50",
                        )}
                    >
                        Pour toi
                    </button>
                    <button
                        type="button"
                        onClick={() => setFeedTab("suivis")}
                        className={cx(
                            "rounded-full px-5 py-2 text-sm font-semibold transition duration-150",
                            feedTab === "suivis" ? "bg-[#C17B2F] text-white" : "text-[#f0dfc0]/50",
                        )}
                    >
                        Suivis
                    </button>
                </div>
            </div>

            {/* ── Feed sections ── */}
            {feedTab === "pour-toi" ? (
            <div className="flex flex-col gap-5 pb-24 pt-4">

                {/* ── 1. Promos du moment — Hero card ── */}
                <section>
                    <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-[#c87830]/15 text-[#c87830]">
                                <Tag01 className="size-4" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#f5deb3]" style={{ letterSpacing: "-0.2px" }}>Promos du moment</h2>
                                <p className="text-[11px] text-[#a07840]" style={{ letterSpacing: "0.2px" }}>Les bons plans près de chez toi</p>
                            </div>
                        </div>
                        <Link href="/search?filter=promos" className="flex items-center gap-0.5 text-xs font-semibold text-[#c87830]">
                            Voir tout
                            <ChevronRight className="size-3.5" />
                        </Link>
                    </div>

                    <div className="mt-3 px-4">
                        {loadingPromos ? (
                            <div className="h-[100px] animate-pulse rounded-[14px] bg-[#2a1a08]" />
                        ) : heroPromo && heroPromo.sale_price ? (
                            <Link
                                href={`/product/${generateSlug(heroPromo.product_name, heroPromo.product_id)}`}
                                className="flex min-h-[120px] overflow-hidden rounded-[14px] border-[0.5px] border-[#3d2a10] bg-[#2a1a08] transition active:bg-[#3d2008]"
                            >
                                {/* Product image */}
                                <div className="relative w-[120px] shrink-0 self-stretch bg-[#3d2008]">
                                    {heroPromo.product_photo ? (
                                        <Image
                                            src={heroPromo.product_photo}
                                            alt={heroPromo.product_name}
                                            fill
                                            className="object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-2xl font-light text-[#a07840]/30">
                                            {heroPromo.product_name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                {/* Info */}
                                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-4">
                                    <span className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-[2px] text-[9px] font-medium text-[#c87830]" style={{ background: "rgba(200,120,48,0.18)", border: "0.5px solid rgba(200,120,48,0.3)" }}>
                                        −{Math.round(((heroPromo.product_price - heroPromo.sale_price) / heroPromo.product_price) * 100)}% · {heroPromo.merchant_name}
                                    </span>
                                    <p className="truncate text-[15px] font-semibold text-[#f5deb3]" style={{ letterSpacing: "-0.1px" }}>{heroPromo.product_name}</p>
                                    <p className="text-[10px] text-[#a07840]">
                                        {heroPromo.distance_km < 1 ? `${Math.round(heroPromo.distance_km * 1000)}m` : `${heroPromo.distance_km.toFixed(1)}km`}
                                    </p>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[13px] font-normal text-[#a07840]">{heroPromo.sale_price.toFixed(2)} €</span>
                                        <span className="text-[11px] text-[#5a3a18]/60 line-through">{heroPromo.product_price.toFixed(2)} €</span>
                                    </div>
                                </div>
                            </Link>
                        ) : (
                            <div className="flex h-[100px] items-center justify-center rounded-[14px] border-[0.5px] border-[#3d2a10] bg-[#2a1a08]">
                                <p className="text-xs text-[#a07840]/50">Aucune promo pour le moment</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* ── 2. Tendances — 2×2 grid ── */}
                <section>
                    <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-[#f5deb3]/10 text-[#f5deb3]/70">
                                <TrendUp01 className="size-4" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#f5deb3]" style={{ letterSpacing: "-0.2px" }}>Tendances</h2>
                                <p className="text-[11px] text-[#a07840]" style={{ letterSpacing: "0.2px" }}>Ce qui se vend le plus dans ton quartier</p>
                            </div>
                        </div>
                        <Link href="/search?filter=trending" className="flex items-center gap-0.5 text-xs font-semibold text-[#c87830]">
                            Voir tout
                            <ChevronRight className="size-3.5" />
                        </Link>
                    </div>

                    <div className="mt-3 px-4">
                        {loadingTrending ? (
                            <div className="grid grid-cols-2 gap-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="h-[160px] animate-pulse rounded-[10px] bg-[#2a1a08]" />
                                ))}
                            </div>
                        ) : trending && trending.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                                {trending.slice(0, 4).map((p) => (
                                    <Link
                                        key={`${p.product_id}-${p.merchant_id}`}
                                        href={`/product/${generateSlug(p.product_name, p.product_id)}`}
                                        className="group overflow-hidden rounded-[10px] border-[0.5px] border-[#3d2a10] bg-[#2a1a08] transition active:bg-[#3d2008]"
                                    >
                                        {/* Image */}
                                        <div className="relative h-[220px] w-full bg-[#3d2008]">
                                            {p.product_photo ? (
                                                <Image
                                                    src={p.product_photo}
                                                    alt={p.product_name}
                                                    fill
                                                    sizes="50vw"
                                                    className="object-cover transition duration-300 group-hover:scale-[1.03]"
                                                />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-2xl font-light text-[#a07840]/20">
                                                    {p.product_name.charAt(0)}
                                                </div>
                                            )}
                                            {/* Heart overlay */}
                                            <div className="absolute right-1.5 top-1.5">
                                                <HeartButton
                                                    isFavorite={favoriteIds.has(p.product_id)}
                                                    onToggle={() => toggleFav(p.product_id)}
                                                    ariaLabel={`${favoriteIds.has(p.product_id) ? "Retirer" : "Ajouter"} ${p.product_name} des favoris`}
                                                />
                                            </div>
                                        </div>
                                        {/* Body */}
                                        <div className="px-2 py-2">
                                            <p className="truncate text-[13px] font-semibold text-[#f0dfc0]">{p.product_name}</p>
                                            <p className="mt-0.5 text-xs font-normal text-[#a07840]">{(p.sale_price ?? p.product_price).toFixed(2)} €</p>
                                            <p className="mt-0.5 text-[10px] text-[#5a4020]">
                                                {p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)}m` : `${p.distance_km.toFixed(1)}km`} · {p.merchant_name}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-[10px] border-[0.5px] border-[#3d2a10] bg-[#2a1a08] px-4 py-8 text-center">
                                <p className="text-xs text-[#a07840]/50">Rien pour le moment</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* ── 3. Boutique à découvrir ── */}
                {featuredShop && (
                    <section className="px-4">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-[#c87830]/15 text-[#c87830]">
                                <MarkerPin01 className="size-4" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#f5deb3]" style={{ letterSpacing: "-0.2px" }}>Boutique à découvrir</h2>
                                <p className="text-[11px] text-[#a07840]" style={{ letterSpacing: "0.2px" }}>
                                    Ouverte maintenant · {featuredShop.distance_km < 1 ? `${Math.round(featuredShop.distance_km * 1000)}m` : `${featuredShop.distance_km.toFixed(1)}km`}
                                </p>
                            </div>
                        </div>

                        <Link
                            href={`/shop/${generateSlug(featuredShop.merchant_name, featuredShop.merchant_id)}`}
                            className="mt-3 flex items-center gap-2.5 rounded-xl border-[0.5px] border-[#3d2a10] bg-[#2a1a08] px-3 py-2.5 transition active:bg-[#3d2008]"
                        >
                            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#3d2008] text-sm font-bold text-[#c87830]">
                                {featuredShop.merchant_photo ? (
                                    <Image src={featuredShop.merchant_photo} alt={featuredShop.merchant_name} width={36} height={36} className="h-full w-full object-cover" />
                                ) : (
                                    featuredShop.merchant_name.charAt(0)
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-[#f5deb3]">{featuredShop.merchant_name}</p>
                                <p className="text-[10px] text-[#a07840]">
                                    {featuredShop.distance_km < 1 ? `${Math.round(featuredShop.distance_km * 1000)}m` : `${featuredShop.distance_km.toFixed(1)}km`} de toi
                                </p>
                            </div>
                            <span className="shrink-0 rounded-lg px-[7px] py-[2px] text-[9px] font-medium text-[#6ecf7f]" style={{ background: "rgba(34,90,45,0.35)" }}>
                                Ouvert
                            </span>
                        </Link>
                    </section>
                )}

                {/* ── 4. Disponible maintenant — horizontal scroll ── */}
                <section>
                    <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                                <svg className="size-4" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="5" /></svg>
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#f5deb3]" style={{ letterSpacing: "-0.2px" }}>Disponible maintenant</h2>
                                <p className="text-[11px] text-[#a07840]" style={{ letterSpacing: "0.2px" }}>Stock confirmé aujourd'hui</p>
                            </div>
                        </div>
                        <Link href="/search?filter=nearby" className="flex items-center gap-0.5 text-xs font-semibold text-[#c87830]">
                            Voir tout
                            <ChevronRight className="size-3.5" />
                        </Link>
                    </div>

                    {loadingNearby ? (
                        <div className="mt-3 flex gap-3 overflow-x-auto px-4 scrollbar-hide">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="aspect-[3/4] w-40 shrink-0 animate-pulse rounded-lg bg-[#2a1a08]" />
                            ))}
                        </div>
                    ) : nearby && nearby.length > 0 ? (
                        <ul role="list" className="mt-3 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
                            {nearby.map((p) => (
                                <li key={`${p.product_id}-${p.merchant_id}`}>
                                    <ProductCard
                                        id={p.product_id}
                                        name={p.product_name}
                                        price={p.product_price}
                                        photo={p.product_photo}
                                        merchantName={p.merchant_name}
                                        distance={p.distance_km}
                                        stockQuantity={p.stock_quantity}
                                        salePrice={p.sale_price}
                                        isFavorite={favoriteIds.has(p.product_id)}
                                        onToggleFavorite={() => toggleFav(p.product_id)}
                                        className="w-44 shrink-0"
                                    />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="mx-4 mt-3 rounded-lg border-[0.5px] border-[#3d2a10] bg-[#2a1a08] px-4 py-8 text-center">
                            <p className="text-xs text-[#a07840]/50">Rien pour le moment — ça arrive vite.</p>
                        </div>
                    )}
                </section>

                {/* ── Followed shops ── */}
                {follows && follows.length > 0 && (
                    <section className="px-4">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-[#c87830]/15 text-[#c87830]">
                                <Heart className="size-4" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#f5deb3]" style={{ letterSpacing: "-0.2px" }}>Tes boutiques</h2>
                                <p className="text-[11px] text-[#a07840]" style={{ letterSpacing: "0.2px" }}>Les dernières nouveautés de tes favoris</p>
                            </div>
                        </div>
                        <div className="mt-3 flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                            {follows.map((f: any) => {
                                const merchant = f.merchants;
                                if (!merchant) return null;
                                return (
                                    <Link
                                        key={f.merchant_id}
                                        href={`/shop/${generateSlug(f.merchants?.name || f.merchant_name || "", f.merchant_id)}`}
                                        className="flex w-20 shrink-0 flex-col items-center gap-1.5"
                                    >
                                        <div className="relative size-16 overflow-hidden rounded-full bg-[#2a1a08] shadow-sm ring-2 ring-[#c87830]/30">
                                            {merchant.photo_url ? (
                                                <Image src={merchant.photo_url} alt={merchant.name} fill className="object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-lg font-bold text-[#c87830]">
                                                    {merchant.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <span className="w-full truncate text-center text-[11px] font-medium text-[#f5deb3]/70">
                                            {merchant.name}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                )}
                {/* ── 6. Tout près de toi — infinite scroll ── */}
                <InfiniteProductGrid lat={lat} lng={lng} category={activeCategory} favoriteIds={favoriteIds} onToggleFav={toggleFav} />
            </div>
            ) : (
                <FollowedFeed follows={follows} favoriteIds={favoriteIds} onToggleFav={toggleFav} />
            )}
        </div>
    );
}

/* ── Infinite scroll product grid ── */
function InfiniteProductGrid({
    lat, lng, category, favoriteIds, onToggleFav,
}: {
    lat: number; lng: number; category: string | null;
    favoriteIds: Set<string>; onToggleFav: (id: string) => void;
}) {
    const [pages, setPages] = useState<any[][]>([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef(1);
    const loadingRef = useRef(false);
    const hasMoreRef = useRef(true);
    const categoryRef = useRef(category);

    // Reset when category changes
    useEffect(() => {
        categoryRef.current = category;
        setPages([]);
        pageRef.current = 1;
        hasMoreRef.current = true;
        setTotal(0);
    }, [category]);

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
            const res = await fetch(`/api/products/discover?${params}`);
            if (!res.ok) {
                hasMoreRef.current = false;
                return;
            }
            const data = await res.json();
            const items = data.products ?? [];
            if (items.length === 0) {
                hasMoreRef.current = false;
                return;
            }
            setPages((prev) => [...prev, items]);
            hasMoreRef.current = data.hasMore;
            setTotal(data.total);
            pageRef.current += 1;
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [lat, lng]);

    // Stable observer — only depends on lat/lng
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0].isIntersecting) loadMore(); },
            { threshold: 0.1 },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [loadMore]);

    const allProducts = useMemo(() => {
        const seen = new Set<string>();
        return pages.flat().filter((p: any) => {
            if (seen.has(p.product_id)) return false;
            seen.add(p.product_id);
            return true;
        });
    }, [pages]);
    const showEmpty = allProducts.length === 0 && !loading && !hasMoreRef.current;

    return (
        <section className="pb-20">
            <div className="px-4 pb-3 pt-6">
                <h2 className="text-base font-semibold text-[#f0dfc0]" style={{ letterSpacing: "-0.2px" }}>Tout près de toi</h2>
                {total > 0 && <p className="mt-0.5 text-[11px] text-[#5a4020]">{total} produits disponibles</p>}
            </div>

            <div className="grid grid-cols-2 gap-2.5 px-4 md:grid-cols-4 md:gap-3 md:px-6">
                {allProducts.map((p: any) => {
                    const isFav = favoriteIds.has(p.product_id);
                    const discount = p.sale_price ? Math.round(((p.product_price - p.sale_price) / p.product_price) * 100) : 0;
                    return (
                        <Link
                            key={p.product_id}
                            href={`/product/${generateSlug(p.product_name, p.product_id)}`}
                            className="overflow-hidden rounded-xl bg-[#1e1409] transition active:opacity-90"
                            style={{ border: "0.5px solid rgba(255,255,255,0.05)" }}
                        >
                            <div className="relative h-[180px] w-full bg-[#2a1c0a] md:h-[200px]">
                                {p.product_photo ? (
                                    <Image src={p.product_photo} alt={p.product_name} fill sizes="50vw" className="object-cover" loading="lazy" />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-2xl font-light text-[#a07840]/20">
                                        {p.product_name?.charAt(0)}
                                    </div>
                                )}
                                {discount > 0 && (
                                    <span className="absolute bottom-2 left-2 text-sm">🏷️</span>
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFav(p.product_id); }}
                                    className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full text-[13px] text-[#f0dfc0]"
                                    style={{ background: "rgba(19,14,7,0.55)" }}
                                >
                                    {isFav ? "♥" : "♡"}
                                </button>
                            </div>
                            <div className="px-2.5 pb-3 pt-2.5">
                                <p className="text-[10px] tracking-wide text-[#7a5c30]">
                                    {p.merchant_name} · {p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)}m` : `${p.distance_km}km`}
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight text-[#e8d4b0]">{p.product_name}</p>
                                <div className="mt-1.5 flex items-baseline gap-1.5">
                                    <span className="text-xs text-[#a07840]">{(p.sale_price ?? p.product_price)?.toFixed(2)} €</span>
                                    {p.sale_price && (
                                        <span className="text-[10px] text-[#3d2a10] line-through">{p.product_price.toFixed(2)} €</span>
                                    )}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Sentinel */}
            <div ref={sentinelRef} className="flex h-10 items-center justify-center">
                {loading && <p className="text-xs text-[#3d2a10]">Chargement...</p>}
                {!hasMoreRef.current && !loading && allProducts.length > 0 && (
                    <p className="text-[11px] tracking-wide text-[#3d2a10]">Le quartier est à sec 📍</p>
                )}
            </div>
        </section>
    );
}

function FollowedFeed({ follows, favoriteIds, onToggleFav }: { follows: any[] | undefined; favoriteIds: Set<string>; onToggleFav: (id: string) => void }) {
    const merchantIds = follows?.map((f: any) => f.merchant_id) ?? [];

    const { data: products, isLoading } = useQuery<DiscoverProduct[]>({
        queryKey: ["followed-products", merchantIds],
        queryFn: async () => {
            if (merchantIds.length === 0) return [];
            const params = new URLSearchParams({ merchant_ids: merchantIds.join(",") });
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
                <div className="flex size-16 items-center justify-center rounded-2xl bg-[#2a1a08] text-2xl">🏪</div>
                <p className="mt-4 text-[15px] font-semibold text-[#f0dfc0]">Aucune boutique suivie</p>
                <p className="mt-1.5 text-[13px] text-[#5a4020]">
                    Abonne-toi à des boutiques pour les retrouver ici.
                </p>
                <Link
                    href="/explore"
                    className="mt-4 rounded-full bg-[#c87830] px-5 py-2.5 text-sm font-semibold text-white transition active:opacity-80"
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
                    <div key={i} className="aspect-square animate-pulse rounded-xl bg-[#2a1a08]" />
                ))}
            </div>
        );
    }

    if (!products || products.length === 0) {
        return (
            <div className="flex flex-col items-center px-6 pb-24 pt-12 text-center">
                <p className="text-[15px] font-semibold text-[#f0dfc0]">Rien de nouveau</p>
                <p className="mt-1.5 text-[13px] text-[#5a4020]">
                    Les boutiques que tu suis n'ont pas encore de produits.
                </p>
            </div>
        );
    }

    // Group products by merchant for Instagram-like display
    const grouped = new Map<string, { merchant: { id: string; name: string; photo: string | null }; products: typeof products }>();
    for (const p of products) {
        if (!grouped.has(p.merchant_id)) {
            grouped.set(p.merchant_id, {
                merchant: { id: p.merchant_id, name: p.merchant_name, photo: p.merchant_photo },
                products: [],
            });
        }
        grouped.get(p.merchant_id)!.products.push(p);
    }

    // Flatten back: interleave merchants so feed feels varied
    const feedItems: Array<{ type: "header"; merchant: { id: string; name: string; photo: string | null } } | { type: "product"; product: (typeof products)[0] }> = [];
    for (const [, group] of grouped) {
        feedItems.push({ type: "header", merchant: group.merchant });
        for (const p of group.products) {
            feedItems.push({ type: "product", product: p });
        }
    }

    return (
        <div className="pb-24 pt-4">
            {feedItems.map((item, i) => {
                if (item.type === "header") {
                    return (
                        <Link
                            key={`h-${item.merchant.id}`}
                            href={`/shop/${generateSlug(item.merchant.name, item.merchant.id)}`}
                            className="flex items-center gap-2.5 px-4 pb-2 pt-4 first:pt-0"
                        >
                            <div className="size-8 shrink-0 overflow-hidden rounded-full bg-[#2a1a08] border border-[#3d2a10]">
                                {item.merchant.photo ? (
                                    <img src={item.merchant.photo} alt={item.merchant.name} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-xs font-bold text-[#c87830]">
                                        {item.merchant.name.charAt(0)}
                                    </div>
                                )}
                            </div>
                            <span className="text-[13px] font-semibold text-[#f5deb3]">{item.merchant.name}</span>
                        </Link>
                    );
                }

                const p = item.product;
                const isFav = favoriteIds.has(p.product_id);
                return (
                    <div key={p.product_id} className="px-4 pb-4">
                        <Link href={`/product/${generateSlug(p.product_name, p.product_id)}`} className="group block">
                            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#2a1a08]">
                                {p.product_photo ? (
                                    <Image src={p.product_photo} alt={p.product_name} fill sizes="100vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" />
                                ) : (
                                    <div className="flex h-full items-center justify-center">
                                        <span className="text-3xl font-light text-[#5a4020]/30">{p.product_name.charAt(0)}</span>
                                    </div>
                                )}
                                <div className="absolute right-3 top-3">
                                    <HeartButton
                                        isFavorite={isFav}
                                        onToggle={() => onToggleFav(p.product_id)}
                                        ariaLabel={`${isFav ? "Retirer" : "Ajouter"} ${p.product_name} des favoris`}
                                        className="bg-white/80 backdrop-blur-sm"
                                    />
                                </div>
                                {p.sale_price && (
                                    <div className="absolute bottom-3 left-3 rounded-md bg-[var(--ts-ochre)] px-2 py-0.5 text-[11px] font-semibold text-white">
                                        -{Math.round(((p.product_price - p.sale_price) / p.product_price) * 100)}%
                                    </div>
                                )}
                            </div>
                            <div className="mt-2">
                                <p className="truncate text-[14px] font-medium text-[#f5deb3]">{p.product_name}</p>
                                <div className="mt-0.5 flex items-baseline gap-2">
                                    {p.sale_price ? (
                                        <>
                                            <span className="text-[13px] text-[#a07840]">{p.sale_price.toFixed(2)} €</span>
                                            <span className="text-[12px] text-[#5a3a18]/60 line-through">{p.product_price.toFixed(2)} €</span>
                                        </>
                                    ) : (
                                        <span className="text-[13px] text-[#a07840]">{p.product_price.toFixed(2)} €</span>
                                    )}
                                </div>
                            </div>
                        </Link>
                    </div>
                );
            })}
        </div>
    );
}

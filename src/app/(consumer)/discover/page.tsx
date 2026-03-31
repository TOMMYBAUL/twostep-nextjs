"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Tag01, TrendUp01, ChevronRight, MarkerPin01, Heart, Bell01, FilterLines } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ProductCard } from "../components/product-card";
import { StoryBar } from "../components/story-bar";
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
        staleTime: 15_000,
    });
}

export default function DiscoverPage() {
    return (
        <Suspense fallback={<div className="min-h-dvh bg-[#F8F9FC]" />}>
            <DiscoverContent />
        </Suspense>
    );
}

function DiscoverContent() {
    const { position } = useGeolocation();
    const lat = position?.lat ?? 43.6047;
    const lng = position?.lng ?? 1.4442;
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [sizeFilter, setSizeFilter] = useState<string | null>(null);
    const [shoeSizeFilter, setShoeSizeFilter] = useState<number | null>(null);
    const [showSizeFilters, setShowSizeFilters] = useState(false);
    const hasActiveSizeFilter = sizeFilter !== null || shoeSizeFilter !== null;
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const tabParam = searchParams.get("tab");
    const feedTab: "explorer" | "pour-toi" | "suivis" =
        tabParam === "pour-toi" || tabParam === "suivis" ? tabParam : "explorer";
    const setFeedTab = useCallback((tab: "explorer" | "pour-toi" | "suivis") => {
        const params = new URLSearchParams(searchParams.toString());
        if (tab === "explorer") params.delete("tab");
        else params.set("tab", tab);
        const qs = params.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }, [searchParams, router, pathname]);

    const { data: availableSizes } = useQuery<{ clothing: string[]; shoe: number[] }>({
        queryKey: ["available-sizes"],
        queryFn: async () => {
            const res = await fetch("/api/products/available-sizes");
            if (!res.ok) return { clothing: [], shoe: [] };
            return res.json();
        },
        staleTime: 5 * 60_000,
    });

    const activeSize = sizeFilter ?? (shoeSizeFilter ? String(shoeSizeFilter) : null);
    const isExplorer = feedTab === "explorer";
    const { data: promos, isLoading: loadingPromos } = useQuery<DiscoverProduct[]>({
        queryKey: ["discover", "promos", lat, lng, activeCategory, activeSize],
        queryFn: async () => {
            const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), section: "promos", radius: "10" });
            if (activeCategory) params.set("category", activeCategory);
            if (activeSize) params.set("size", activeSize);
            const res = await fetch(`/api/discover?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        staleTime: 15_000,
        enabled: isExplorer,
    });
    const { data: trending, isLoading: loadingTrending } = useQuery<DiscoverProduct[]>({
        queryKey: ["discover", "trending", lat, lng, activeCategory, activeSize],
        queryFn: async () => {
            const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), section: "trending", radius: "10" });
            if (activeCategory) params.set("category", activeCategory);
            if (activeSize) params.set("size", activeSize);
            const res = await fetch(`/api/discover?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        staleTime: 15_000,
        enabled: isExplorer,
    });
    const { data: nearby, isLoading: loadingNearby } = useQuery<DiscoverProduct[]>({
        queryKey: ["discover", "nearby", lat, lng, activeCategory, activeSize],
        queryFn: async () => {
            const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), section: "nearby", radius: "10" });
            if (activeCategory) params.set("category", activeCategory);
            if (activeSize) params.set("size", activeSize);
            const res = await fetch(`/api/discover?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        staleTime: 15_000,
        enabled: isExplorer,
    });

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();
    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);
    const { data: follows } = useFollows();

    const toggleFav = (id: string) => {
        if (favoriteIds.has(id)) remove.mutate(id);
        else add.mutate(id);
    };

    // Top 3 promos sorted by discount % (then distance)
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
        <div className="min-h-dvh bg-[#F8F9FC]" style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif" }}>
            {/* ── Header ── */}
            <div className="px-4 pb-2 pt-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <img src="/logo-icon.webp?v=2" alt="" className="size-6" />
                        <h1 className="font-display text-sm font-bold uppercase text-[var(--ts-text)]">Two-Step</h1>
                        <span className="text-[10px] text-[#8E96B0]">·</span>
                        <p className="flex items-center gap-0.5 text-[11px] text-[#8E96B0]">
                            <MarkerPin01 className="size-2.5" aria-hidden="true" />
                            {position ? "Autour de toi" : "Toulouse"}
                        </p>
                    </div>
                    <Link
                        href="/profile/notifications"
                        className="flex size-7 items-center justify-center rounded-full bg-[#F5F6FA] transition active:bg-[#E2E5F0]"
                    >
                        <Bell01 className="size-3.5 text-[#8E96B0]" />
                    </Link>
                </div>

                {/* ── Category pills + size filter (Explorer tab only) ── */}
                {feedTab === "explorer" && <>
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                    {/* Size filter toggle */}
                    <button
                        type="button"
                        onClick={() => setShowSizeFilters((v) => !v)}
                        className={cx(
                            "relative flex shrink-0 items-center justify-center rounded-full transition duration-150",
                            hasActiveSizeFilter || showSizeFilters
                                ? "bg-[#4268FF] text-[#F8F9FC] shadow-sm"
                                : "bg-[#F5F6FA] text-[#1A1F36]/60",
                            "size-7",
                        )}
                        aria-label="Filtrer par taille"
                    >
                        <FilterLines className="size-3.5" />
                        {hasActiveSizeFilter && (
                            <span className="absolute -right-0.5 -top-0.5 flex size-3 items-center justify-center rounded-full bg-[#4268FF] text-[7px] text-white">
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
                                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition duration-150",
                                activeCategory === cat.value
                                    ? "bg-[#4268FF] text-[#F8F9FC] shadow-sm"
                                    : "bg-[#F5F6FA] text-[#1A1F36]/60",
                            )}
                        >
                            {cat.emoji && <span className="text-[11px]">{cat.emoji}</span>}
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
                            <div className="mt-3 rounded-xl border-[0.5px] border-[#E2E5F0] bg-[#F5F6FA] p-3">
                                {/* Clothing size */}
                                {(availableSizes?.clothing?.length ?? 0) > 0 && (
                                    <>
                                        <p className="mb-2 text-[11px] font-medium text-[#8E96B0]">Taille vêtements</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {availableSizes!.clothing.map((s) => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => { setSizeFilter(sizeFilter === s ? null : s); setShowSizeFilters(false); }}
                                                    className={cx(
                                                        "rounded-lg px-3 py-1.5 text-[11px] font-medium transition duration-100",
                                                        sizeFilter === s
                                                            ? "bg-[#4268FF] text-[#F8F9FC]"
                                                            : "bg-[#F8F9FC] text-[#1A1F36]/60",
                                                    )}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* Shoe size */}
                                {(availableSizes?.shoe?.length ?? 0) > 0 && (
                                    <>
                                        <p className={cx("mb-2 text-[11px] font-medium text-[#8E96B0]", (availableSizes?.clothing?.length ?? 0) > 0 && "mt-3")}>Pointure</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {availableSizes!.shoe.map((s) => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => { setShoeSizeFilter(shoeSizeFilter === s ? null : s); setShowSizeFilters(false); }}
                                                    className={cx(
                                                        "rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition duration-100",
                                                        shoeSizeFilter === s
                                                            ? "bg-[#4268FF] text-[#F8F9FC]"
                                                            : "bg-[#F8F9FC] text-[#1A1F36]/60",
                                                    )}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {(availableSizes?.clothing?.length ?? 0) === 0 && (availableSizes?.shoe?.length ?? 0) === 0 && (
                                    <p className="text-[11px] text-[#8E96B0]">Aucune taille renseignée pour le moment.</p>
                                )}

                                {/* Reset */}
                                {hasActiveSizeFilter && (
                                    <button
                                        type="button"
                                        onClick={() => { setSizeFilter(null); setShoeSizeFilter(null); }}
                                        className="mt-2.5 text-[11px] font-medium text-[#4268FF]"
                                    >
                                        Réinitialiser les filtres
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                </>}
            </div>

            {/* ── Explorer / Pour toi / Suivis toggle ── */}
            <div className="flex border-b border-[#E2E5F0]">
                {(["explorer", "pour-toi", "suivis"] as const).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setFeedTab(tab)}
                        className={cx(
                            "flex-1 py-2.5 text-center text-[12px] font-semibold transition duration-150",
                            feedTab === tab
                                ? "border-b-2 border-[#4268FF] text-[#1A1F36]"
                                : "text-[#8E96B0]",
                        )}
                    >
                        {tab === "explorer" ? "Explorer" : tab === "pour-toi" ? "Pour toi" : "Suivis"}
                    </button>
                ))}
            </div>

            {/* ── Feed sections ── */}
            {feedTab === "explorer" ? (
            <div className="flex flex-col gap-5 pb-24 pt-4">

                {/* ── 1. Promos du moment — 1 grande + 3 petites ── */}
                {(loadingPromos || topPromos.length > 0) && (
                <section>
                    <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-[#4268FF]/15 text-[#4268FF]">
                                <Tag01 className="size-4" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#1A1F36]" style={{ letterSpacing: "-0.2px" }}>Promos du moment</h2>
                                <p className="text-[11px] text-[#8E96B0]" style={{ letterSpacing: "0.2px" }}>Les bons plans près de chez toi</p>
                            </div>
                        </div>
                        <Link href={`/search?filter=promos${activeCategory ? `&category=${activeCategory}` : ""}${activeSize ? `&size=${activeSize}` : ""}`} className="flex items-center gap-0.5 text-xs font-semibold text-[#4268FF]">
                            Voir tout
                            <ChevronRight className="size-3.5" />
                        </Link>
                    </div>

                    {topPromos.length > 0 && (
                    <div className="mt-3 flex flex-col px-3.5" style={{ gap: 10 }}>
                        {loadingPromos ? (
                            <div className="h-[84px] animate-pulse rounded-[10px] bg-[#F5F6FA]" />
                        ) : (<>
                            {/* Grande card — promo vedette */}
                            <Link
                                href={`/product/${generateSlug(topPromos[0].product_name, topPromos[0].product_id)}`}
                                className="flex items-center rounded-[10px] bg-[#F5F6FA] p-2.5 transition active:bg-[#E2E5F0]"
                                style={{ gap: 10 }}
                            >
                                <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-[#E2E5F0]">
                                    {topPromos[0].product_photo ? (
                                        <Image src={topPromos[0].product_photo} alt={topPromos[0].product_name} fill sizes="64px" className="object-cover" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-lg font-light text-[#8E96B0]/30">{topPromos[0].product_name.charAt(0)}</div>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="inline-flex w-fit items-center rounded-full text-[11px] font-medium text-[#185FA5]" style={{ background: "rgba(66,104,255,0.13)", padding: "2px 7px" }}>
                                        −{Math.round(((topPromos[0].product_price - topPromos[0].sale_price!) / topPromos[0].product_price) * 100)}% · {topPromos[0].merchant_name}
                                    </span>
                                    <p className="mt-1 truncate text-[13px] font-medium text-[#1A1F36]">{topPromos[0].product_name}</p>
                                    <p className="mt-0.5 text-[10px] text-[#8E96B0]">
                                        {topPromos[0].distance_km < 1 ? `${Math.round(topPromos[0].distance_km * 1000)}m` : `${topPromos[0].distance_km.toFixed(1)}km`}
                                    </p>
                                    <div className="mt-0.5 flex items-baseline gap-1.5">
                                        <span className="text-xs text-[#1A1F36]">{topPromos[0].sale_price!.toFixed(2)} €</span>
                                        <span className="text-[10px] text-[#8E96B0]/60 line-through">{topPromos[0].product_price.toFixed(2)} €</span>
                                    </div>
                                </div>
                            </Link>

                            {/* 3 petites cards */}
                            {topPromos.length > 1 && (
                                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(topPromos.length - 1, 4)}, 1fr)` }}>
                                    {topPromos.slice(1, 5).map((p) => (
                                        <Link
                                            key={`${p.product_id}-${p.merchant_id}`}
                                            href={`/product/${generateSlug(p.product_name, p.product_id)}`}
                                            className="overflow-hidden rounded-[10px] bg-[#F5F6FA] transition active:bg-[#E2E5F0]"
                                        >
                                            <div className="relative h-[145px] w-full bg-[#E2E5F0]">
                                                {p.product_photo ? (
                                                    <Image src={p.product_photo} alt={p.product_name} fill sizes="33vw" className="object-cover" />
                                                ) : (
                                                    <div className="flex h-full items-center justify-center text-base font-light text-[#8E96B0]/20">{p.product_name.charAt(0)}</div>
                                                )}
                                                <span className="absolute bottom-1 left-1 rounded-full text-[11px] font-medium text-[#185FA5]" style={{ background: "rgba(66,104,255,0.13)", padding: "1px 6px" }}>
                                                    −{Math.round(((p.product_price - p.sale_price!) / p.product_price) * 100)}%
                                                </span>
                                            </div>
                                            <div style={{ padding: "5px 6px 7px" }}>
                                                <p className="truncate text-[10px] font-medium text-[#1A1F36]">{p.product_name}</p>
                                                <p className="mt-0.5 text-[9px] text-[#8E96B0]">
                                                    {p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)}m` : `${p.distance_km.toFixed(1)}km`}
                                                </p>
                                                <p className="mt-0.5 text-[10px] text-[#1A1F36]">{p.sale_price!.toFixed(2)} €</p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </>)}
                    </div>
                    )}
                </section>
                )}

                {/* ── 2. Tendances — 2×2 grid ── */}
                <section>
                    <div className="flex items-center justify-between px-4">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-[#1A1F36]/10 text-[#1A1F36]/70">
                                <TrendUp01 className="size-4" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#1A1F36]" style={{ letterSpacing: "-0.2px" }}>Tendances</h2>
                                <p className="text-[11px] text-[#8E96B0]" style={{ letterSpacing: "0.2px" }}>Ce qui se vend le plus dans ton quartier</p>
                            </div>
                        </div>
                        <Link href={`/search?filter=trending${activeCategory ? `&category=${activeCategory}` : ""}${activeSize ? `&size=${activeSize}` : ""}`} className="flex items-center gap-0.5 text-xs font-semibold text-[#4268FF]">
                            Voir tout
                            <ChevronRight className="size-3.5" />
                        </Link>
                    </div>

                    <div className="mt-3 px-4">
                        {loadingTrending ? (
                            <div className="grid grid-cols-2 gap-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="h-[160px] animate-pulse rounded-[10px] bg-[#F5F6FA]" />
                                ))}
                            </div>
                        ) : trending && trending.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                                {trending.slice(0, 4).map((p) => (
                                    <Link
                                        key={`${p.product_id}-${p.merchant_id}`}
                                        href={`/product/${generateSlug(p.product_name, p.product_id)}`}
                                        className="group overflow-hidden rounded-[10px] border-[0.5px] border-[#E2E5F0] bg-[#F5F6FA] transition active:bg-[#E2E5F0]"
                                    >
                                        {/* Image */}
                                        <div className="relative h-[220px] w-full bg-[#E2E5F0]">
                                            {p.product_photo ? (
                                                <Image
                                                    src={p.product_photo}
                                                    alt={p.product_name}
                                                    fill
                                                    sizes="50vw"
                                                    className="object-cover transition duration-300 group-hover:scale-[1.03]"
                                                />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-2xl font-light text-[#8E96B0]/20">
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
                                            <p className="truncate text-[13px] font-semibold text-[#1A1F36]">{p.product_name}</p>
                                            <p className="mt-0.5 text-xs font-normal text-[#8E96B0]">{(p.sale_price ?? p.product_price).toFixed(2)} €</p>
                                            <p className="mt-0.5 text-[10px] text-[#8E96B0]">
                                                {p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)}m` : `${p.distance_km.toFixed(1)}km`} · {p.merchant_name}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-[10px] border-[0.5px] border-[#E2E5F0] bg-[#F5F6FA] px-4 py-8 text-center">
                                <p className="text-xs text-[#8E96B0]/50">Rien pour le moment</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* ── 3. Boutique à découvrir ── */}
                {featuredShop && (
                    <section className="px-4">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-[#4268FF]/15 text-[#4268FF]">
                                <MarkerPin01 className="size-4" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#1A1F36]" style={{ letterSpacing: "-0.2px" }}>Boutique à découvrir</h2>
                                <p className="text-[11px] text-[#8E96B0]" style={{ letterSpacing: "0.2px" }}>
                                    À {featuredShop.distance_km < 1 ? `${Math.round(featuredShop.distance_km * 1000)}m` : `${featuredShop.distance_km.toFixed(1)}km`} de toi
                                </p>
                            </div>
                        </div>

                        <Link
                            href={`/shop/${generateSlug(featuredShop.merchant_name, featuredShop.merchant_id)}`}
                            className="mt-3 flex items-center gap-2.5 rounded-xl border-[0.5px] border-[#E2E5F0] bg-[#F5F6FA] px-3 py-2.5 transition active:bg-[#E2E5F0]"
                        >
                            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#E2E5F0] text-sm font-bold text-[#4268FF]">
                                {featuredShop.merchant_photo ? (
                                    <Image src={featuredShop.merchant_photo} alt={featuredShop.merchant_name} width={36} height={36} className="h-full w-full object-cover" />
                                ) : (
                                    featuredShop.merchant_name.charAt(0)
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-[#1A1F36]">{featuredShop.merchant_name}</p>
                                <p className="text-[10px] text-[#8E96B0]">
                                    {featuredShop.distance_km < 1 ? `${Math.round(featuredShop.distance_km * 1000)}m` : `${featuredShop.distance_km.toFixed(1)}km`} de toi
                                </p>
                            </div>
                            <span className="shrink-0 rounded-lg bg-[#4268FF]/10 px-[7px] py-[2px] text-[9px] font-medium text-[#4268FF]">
                                Voir →
                            </span>
                        </Link>
                    </section>
                )}

                {/* ── 4. Promotions — horizontal scroll ── */}
                {/* ── Followed shops ── */}
                {follows && follows.length > 0 && (
                    <section className="px-4">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-[#4268FF]/15 text-[#4268FF]">
                                <Heart className="size-4" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#1A1F36]" style={{ letterSpacing: "-0.2px" }}>Tes boutiques</h2>
                                <p className="text-[11px] text-[#8E96B0]" style={{ letterSpacing: "0.2px" }}>Les dernières nouveautés de tes favoris</p>
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
                                        <div className="relative size-16 overflow-hidden rounded-full bg-[#F5F6FA] shadow-sm ring-2 ring-[#4268FF]/30">
                                            {merchant.photo_url ? (
                                                <Image src={merchant.photo_url} alt={merchant.name} fill className="object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-lg font-bold text-[#4268FF]">
                                                    {merchant.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <span className="w-full truncate text-center text-[11px] font-medium text-[#1A1F36]/70">
                                            {merchant.name}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                )}
                {/* ── 6. Tout près de toi — infinite scroll ── */}
                <InfiniteProductGrid lat={lat} lng={lng} category={activeCategory} size={activeSize} favoriteIds={favoriteIds} onToggleFav={toggleFav} />
            </div>
            ) : feedTab === "pour-toi" ? (
                <ForYouFeed follows={follows} favoriteIds={favoriteIds} onToggleFav={toggleFav} lat={lat} lng={lng} />
            ) : (
                <FollowedFeed follows={follows} favoriteIds={favoriteIds} onToggleFav={toggleFav} category={activeCategory} size={activeSize} />
            )}
        </div>
    );
}

/* ── Infinite scroll product grid ── */
function InfiniteProductGrid({
    lat, lng, category, size, favoriteIds, onToggleFav,
}: {
    lat: number; lng: number; category: string | null; size: string | null;
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
    const sizeRef = useRef(size);

    // Reset when category or size changes
    useEffect(() => {
        categoryRef.current = category;
        sizeRef.current = size;
        setPages([]);
        pageRef.current = 1;
        hasMoreRef.current = true;
        setTotal(0);
    }, [category, size]);

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
                <h2 className="text-base font-semibold text-[#1A1F36]" style={{ letterSpacing: "-0.2px" }}>Tout près de toi</h2>
                {total > 0 && <p className="mt-0.5 text-[11px] text-[#8E96B0]">{total} produits disponibles</p>}
            </div>

            <div className="grid grid-cols-2 gap-2.5 px-4 md:grid-cols-4 md:gap-3 md:px-6">
                {allProducts.map((p: any) => {
                    const isFav = favoriteIds.has(p.product_id);
                    const discount = p.sale_price ? Math.round(((p.product_price - p.sale_price) / p.product_price) * 100) : 0;
                    return (
                        <Link
                            key={p.product_id}
                            href={`/product/${generateSlug(p.product_name, p.product_id)}`}
                            className="overflow-hidden rounded-xl bg-[#F8F9FC] transition active:opacity-90"
                            style={{ border: "0.5px solid rgba(255,255,255,0.05)" }}
                        >
                            <div className="relative h-[180px] w-full bg-[#F5F6FA] md:h-[200px]">
                                {p.product_photo ? (
                                    <Image src={p.product_photo} alt={p.product_name} fill sizes="50vw" className="object-cover" loading="lazy" />
                                ) : (
                                    <div className="flex h-full items-center justify-center text-2xl font-light text-[#8E96B0]/20">
                                        {p.product_name?.charAt(0)}
                                    </div>
                                )}
                                {discount > 0 && (
                                    <span className="absolute bottom-2 left-2 text-sm">🏷️</span>
                                )}
                                <div className="absolute right-2 top-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                                    <HeartButton
                                        isFavorite={isFav}
                                        onToggle={() => onToggleFav(p.product_id)}
                                        ariaLabel={`${isFav ? "Retirer" : "Ajouter"} ${p.product_name} des favoris`}
                                    />
                                </div>
                            </div>
                            <div className="px-2.5 pb-3 pt-2.5">
                                <p className="text-[10px] tracking-wide text-[#8E96B0]">
                                    {p.merchant_name} · {p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)}m` : `${p.distance_km}km`}
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs font-medium leading-tight text-[#6B7799]">{p.product_name}</p>
                                <div className="mt-1.5 flex items-baseline gap-1.5">
                                    <span className="text-xs text-[#8E96B0]">{(p.sale_price ?? p.product_price)?.toFixed(2)} €</span>
                                    {p.sale_price && (
                                        <span className="text-[10px] text-[#E2E5F0] line-through">{p.product_price.toFixed(2)} €</span>
                                    )}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Sentinel */}
            <div ref={sentinelRef} className="flex h-10 items-center justify-center">
                {loading && <p className="text-xs text-[#E2E5F0]">Chargement...</p>}
                {!hasMoreRef.current && !loading && allProducts.length > 0 && (
                    <p className="text-[11px] tracking-wide text-[#E2E5F0]">Le quartier est à sec 📍</p>
                )}
            </div>
        </section>
    );
}

/* ── For You feed — followed shops, auto size filtered, promos first ── */
function ForYouFeed({ follows, favoriteIds, onToggleFav, lat, lng }: { follows: any[] | undefined; favoriteIds: Set<string>; onToggleFav: (id: string) => void; lat: number; lng: number }) {
    const merchantIds = follows?.map((f: any) => f.merchant_id) ?? [];
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

    // Section 2: suggestions from OTHER shops, same sizes — use clothing first, then shoe
    const primarySize = clothingSize ?? (shoeSize ? String(shoeSize) : null);
    const secondarySize = clothingSize && shoeSize ? String(shoeSize) : null;

    const { data: suggestions } = useQuery<DiscoverProduct[]>({
        queryKey: ["for-you-suggestions", lat, lng, primarySize, secondarySize, merchantIds],
        queryFn: async () => {
            if (!primarySize) return [];
            // Fetch nearby products filtered by primary size
            const params1 = new URLSearchParams({ lat: String(lat), lng: String(lng), section: "nearby", radius: "10", size: primarySize });
            const res1 = await fetch(`/api/discover?${params1}`);
            const data1 = res1.ok ? await res1.json() : { products: [] };
            let items: DiscoverProduct[] = data1.products ?? [];

            // If secondary size, also fetch those
            if (secondarySize) {
                const params2 = new URLSearchParams({ lat: String(lat), lng: String(lng), section: "nearby", radius: "10", size: secondarySize });
                const res2 = await fetch(`/api/discover?${params2}`);
                const data2 = res2.ok ? await res2.json() : { products: [] };
                const seen = new Set(items.map((p) => p.product_id));
                for (const p of (data2.products ?? []) as DiscoverProduct[]) {
                    if (!seen.has(p.product_id)) items.push(p);
                }
            }

            // Exclude products from followed merchants
            return items.filter((p) => !followedSet.has(p.merchant_id));
        },
        enabled: hasPrefs,
        staleTime: 60_000,
    });

    const { data: stories } = useQuery<any[]>({
        queryKey: ["stories", merchantIds],
        queryFn: async () => {
            if (merchantIds.length === 0) return [];
            const res = await fetch(`/api/stories?merchant_ids=${merchantIds.join(",")}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.stories ?? [];
        },
        enabled: merchantIds.length > 0,
        staleTime: 60_000,
    });

    // Product card renderer (shared between both sections)
    const renderProductCard = (p: DiscoverProduct) => {
        const isFav = favoriteIds.has(p.product_id);
        return (
            <div key={p.product_id}>
                <Link href={`/product/${generateSlug(p.product_name, p.product_id)}`} className="group block">
                    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#F5F6FA]">
                        {p.product_photo ? (
                            <Image src={p.product_photo} alt={p.product_name} fill sizes="50vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" />
                        ) : (
                            <div className="flex h-full items-center justify-center">
                                <span className="text-3xl font-light text-[#8E96B0]/30">{p.product_name.charAt(0)}</span>
                            </div>
                        )}
                        {p.sale_price && (
                            <div className="absolute left-3 top-3 rounded-lg bg-[#FF4757] px-2 py-0.5 text-[10px] font-bold text-white">
                                -{Math.round(((p.product_price - p.sale_price) / p.product_price) * 100)}%
                            </div>
                        )}
                        <div className="absolute right-3 top-3">
                            <HeartButton
                                isFavorite={isFav}
                                onToggle={() => onToggleFav(p.product_id)}
                                ariaLabel={`${isFav ? "Retirer" : "Ajouter"} ${p.product_name} des favoris`}
                                className="!size-8 !rounded-full [background:rgba(26,31,54,0.5)]"
                            />
                        </div>
                    </div>
                </Link>
                <div className="mt-2">
                    <p className="text-[10px] text-[#8E96B0] uppercase">{p.merchant_name}</p>
                    <p className="truncate text-[13px] font-semibold text-[#1A1F36]">{p.product_name}</p>
                    <div className="mt-0.5 flex items-baseline gap-2">
                        <span className="text-[12px] text-[#6B7799]">{(p.sale_price ?? p.product_price).toFixed(2)} €</span>
                        {p.sale_price && <span className="text-[10px] text-[#E2E5F0] line-through">{p.product_price.toFixed(2)} €</span>}
                    </div>
                </div>
            </div>
        );
    };

    if (!hasPrefs) {
        return (
            <div className="pb-24 pt-2">
                <Link href="/profile" className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-[#FFF8EE] px-3.5 py-2.5">
                    <span className="text-[11px] font-medium text-[#C88A3A]">Renseigne ta taille pour un feed personnalisé</span>
                    <ChevronRight className="size-3.5 text-[#C88A3A]" />
                </Link>
            </div>
        );
    }

    if (!follows || follows.length === 0) {
        return (
            <div className="pb-24 pt-2">
                {/* Size banner */}
                <div className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-[#EEF0FF] px-3.5 py-2.5">
                    <span className="text-[11px] font-medium text-[#4268FF]">Filtré pour toi</span>
                    <div className="flex gap-1.5">
                        {clothingSize && <span className="rounded-lg bg-[#4268FF] px-2 py-0.5 text-[10px] font-semibold text-white">{clothingSize}</span>}
                        {shoeSize && <span className="rounded-lg bg-[#4268FF] px-2 py-0.5 text-[10px] font-semibold text-white">{shoeSize}</span>}
                    </div>
                </div>

                {/* No follows — skip to suggestions */}
                {suggestions && suggestions.length > 0 && (
                    <>
                        <p className="mb-3 px-4 text-[13px] font-semibold text-[#1A1F36]">Autour de toi, à ta taille</p>
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
            {/* Stories bar */}
            <StoryBar stories={stories ?? []} />

            {/* Size auto-filter banner */}
            <div className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-[#EEF0FF] px-3.5 py-2.5">
                <span className="text-[11px] font-medium text-[#4268FF]">Filtré pour toi</span>
                <div className="flex gap-1.5">
                    {clothingSize && <span className="rounded-lg bg-[#4268FF] px-2 py-0.5 text-[10px] font-semibold text-white">{clothingSize}</span>}
                    {shoeSize && <span className="rounded-lg bg-[#4268FF] px-2 py-0.5 text-[10px] font-semibold text-white">{shoeSize}</span>}
                </div>
            </div>

            {/* ── Section 1: Followed shops ── */}
            <p className="mb-3 px-4 text-[13px] font-semibold text-[#1A1F36]">Tes boutiques</p>

            {isLoading && (
                <div className="grid grid-cols-2 gap-3 px-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="aspect-square animate-pulse rounded-xl bg-[#F5F6FA]" />
                    ))}
                </div>
            )}

            {!isLoading && (!products || products.length === 0) && (
                <div className="px-4 pb-4 pt-2 text-center">
                    <p className="text-[12px] text-[#8E96B0]">Pas de produit dans ta taille chez tes boutiques suivies pour le moment</p>
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
                        <div className="h-px flex-1 bg-[#E2E5F0]" />
                        <span className="text-[11px] font-medium text-[#8E96B0]">Suggestions</span>
                        <div className="h-px flex-1 bg-[#E2E5F0]" />
                    </div>
                    <p className="mb-3 px-4 text-[13px] font-semibold text-[#1A1F36]">Autour de toi, à ta taille</p>
                    <div className="grid grid-cols-2 gap-3 px-4">
                        {suggestions.map(renderProductCard)}
                    </div>
                </>
            )}
        </div>
    );
}

function FollowedFeed({ follows, favoriteIds, onToggleFav, category, size }: { follows: any[] | undefined; favoriteIds: Set<string>; onToggleFav: (id: string) => void; category: string | null; size: string | null }) {
    const merchantIds = follows?.map((f: any) => f.merchant_id) ?? [];

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
                <div className="flex size-16 items-center justify-center rounded-2xl bg-[#F5F6FA] text-2xl">🏪</div>
                <p className="mt-4 text-[15px] font-semibold text-[#1A1F36]">Aucune boutique suivie</p>
                <p className="mt-1.5 text-[13px] text-[#8E96B0]">
                    Abonne-toi à des boutiques pour les retrouver ici.
                </p>
                <Link
                    href="/explore"
                    className="mt-4 rounded-full bg-[#4268FF] px-5 py-2.5 text-sm font-semibold text-white transition active:opacity-80"
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
                    <div key={i} className="aspect-square animate-pulse rounded-xl bg-[#F5F6FA]" />
                ))}
            </div>
        );
    }

    if (!products || products.length === 0) {
        return (
            <div className="flex flex-col items-center px-6 pb-24 pt-12 text-center">
                <p className="text-[15px] font-semibold text-[#1A1F36]">Rien de nouveau</p>
                <p className="mt-1.5 text-[13px] text-[#8E96B0]">
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
                        {/* Product image */}
                        <Link href={`/product/${generateSlug(p.product_name, p.product_id)}`} className="group block">
                            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#F5F6FA]">
                                {p.product_photo ? (
                                    <Image src={p.product_photo} alt={p.product_name} fill sizes="100vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" />
                                ) : (
                                    <div className="flex h-full items-center justify-center">
                                        <span className="text-3xl font-light text-[#8E96B0]/30">{p.product_name.charAt(0)}</span>
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
                        </Link>

                        {/* Product info with merchant photo on the left */}
                        <div className="mt-2 flex items-start gap-2.5">
                            {/* Merchant photo — clickable to shop */}
                            <Link
                                href={`/shop/${generateSlug(p.merchant_name, p.merchant_id)}`}
                                className="mt-0.5 shrink-0 transition active:opacity-70"
                            >
                                <div className="size-8 overflow-hidden rounded-full bg-[#F5F6FA] border border-[#E2E5F0]">
                                    {p.merchant_photo ? (
                                        <img src={p.merchant_photo} alt={p.merchant_name} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-[10px] font-bold text-[#4268FF]">
                                            {p.merchant_name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                            </Link>

                            {/* Name + price */}
                            <div className="min-w-0 flex-1">
                                <Link
                                    href={`/shop/${generateSlug(p.merchant_name, p.merchant_id)}`}
                                    className="text-[12px] font-semibold text-[#8E96B0] transition active:opacity-70"
                                >
                                    {p.merchant_name}
                                </Link>
                                <p className="truncate text-[14px] font-medium text-[#1A1F36]">{p.product_name}</p>
                                <div className="mt-0.5 flex items-baseline gap-2">
                                    {p.sale_price ? (
                                        <>
                                            <span className="text-[13px] text-[#8E96B0]">{p.sale_price.toFixed(2)} €</span>
                                            <span className="text-[12px] text-[#8E96B0]/60 line-through">{p.product_price.toFixed(2)} €</span>
                                        </>
                                    ) : (
                                        <span className="text-[13px] text-[#8E96B0]">{p.product_price.toFixed(2)} €</span>
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

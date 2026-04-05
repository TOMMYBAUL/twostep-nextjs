"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { ChevronRight, FilterLines, Building07 } from "@untitledui/icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useSwipeable } from "react-swipeable";
import { ProductCard } from "../components/product-card";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useFollows } from "../hooks/use-follows";
import { generateSlug } from "@/lib/slug";
import { useGeolocation } from "../hooks/use-geolocation";
import { cx } from "@/utils/cx";
import { HeartButton } from "../components/heart-button";
import { CategoryPills } from "../components/category-pills";
import { FeedHeader, type FeedTab } from "../components/feed-header";
import { ProductCardSkeleton, PromoCardSkeleton } from "../components/feed-skeleton";
import { FilterPanel, type Filters } from "../components/filter-panel";

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
        <Suspense fallback={<div className="min-h-dvh bg-white" />}>
            <DiscoverContent />
        </Suspense>
    );
}

function DiscoverContent() {
    const prefersReducedMotion = useReducedMotion();
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => { setHasMounted(true); }, []);
    const { position } = useGeolocation();
    const lat = position?.lat ?? 43.6047;
    const lng = position?.lng ?? 1.4442;
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [sizeFilter, setSizeFilter] = useState<string | null>(null);
    const [shoeSizeFilter, setShoeSizeFilter] = useState<number | null>(null);
    const [showSizeFilters, setShowSizeFilters] = useState(false);
    const hasActiveSizeFilter = sizeFilter !== null || shoeSizeFilter !== null;
    const [filters, setFilters] = useState<Filters>({ brand: null, color: null, gender: null, priceMin: null, priceMax: null });
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const tabParam = searchParams.get("tab");
    const feedTab: "explorer" | "pour-toi" | "suivis" =
        tabParam === "pour-toi" || tabParam === "suivis" ? tabParam : "explorer";
    const setFeedTab = useCallback((tab: FeedTab) => {
        const params = new URLSearchParams(searchParams.toString());
        if (tab === "explorer") params.delete("tab");
        else params.set("tab", tab);
        const qs = params.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }, [searchParams, router, pathname]);

    const tabOrder: FeedTab[] = ["explorer", "pour-toi", "suivis"];
    const swipeHandlers = useSwipeable({
        onSwipedLeft: () => {
            const idx = tabOrder.indexOf(feedTab);
            if (idx < tabOrder.length - 1) setFeedTab(tabOrder[idx + 1]);
        },
        onSwipedRight: () => {
            const idx = tabOrder.indexOf(feedTab);
            if (idx > 0) setFeedTab(tabOrder[idx - 1]);
        },
        trackMouse: false,
        delta: 80,
        preventScrollOnSwipe: false,
    });

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

    /** Append active filter params to a URLSearchParams instance */
    const appendFilterParams = (params: URLSearchParams) => {
        if (filters.brand) params.set("brand", filters.brand);
        if (filters.color) params.set("color", filters.color);
        if (filters.gender) params.set("gender", filters.gender);
        if (filters.priceMin != null) params.set("priceMin", String(filters.priceMin));
        if (filters.priceMax != null) params.set("priceMax", String(filters.priceMax));
    };

    const { data: promos, isLoading: loadingPromos } = useQuery<DiscoverProduct[]>({
        queryKey: ["discover", "promos", lat, lng, activeCategory, activeSize, filters],
        queryFn: async () => {
            const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), section: "promos", radius: "10" });
            if (activeCategory) params.set("category", activeCategory);
            if (activeSize) params.set("size", activeSize);
            appendFilterParams(params);
            const res = await fetch(`/api/discover?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        staleTime: 15_000,
        enabled: isExplorer,
    });
    const { data: trending, isLoading: loadingTrending } = useQuery<DiscoverProduct[]>({
        queryKey: ["discover", "trending", lat, lng, activeCategory, activeSize, filters],
        queryFn: async () => {
            const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), section: "trending", radius: "10" });
            if (activeCategory) params.set("category", activeCategory);
            if (activeSize) params.set("size", activeSize);
            appendFilterParams(params);
            const res = await fetch(`/api/discover?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        staleTime: 15_000,
        enabled: isExplorer,
    });
    const { data: nearby, isLoading: loadingNearby } = useQuery<DiscoverProduct[]>({
        queryKey: ["discover", "nearby", lat, lng, activeCategory, activeSize, filters],
        queryFn: async () => {
            const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), section: "nearby", radius: "10" });
            if (activeCategory) params.set("category", activeCategory);
            if (activeSize) params.set("size", activeSize);
            appendFilterParams(params);
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
        <div className="min-h-dvh bg-primary">
            <h1 className="sr-only">Découvrir — Two-Step</h1>
            {/* ── Feed Header (TikTok-style tabs) ── */}
            <FeedHeader activeTab={feedTab} onTabChange={setFeedTab} />

            {/* ── Category pills + size filter (Explorer tab only) ── */}
            <div className="px-4 pb-2 pt-3">
                {feedTab === "explorer" && <>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                    {/* Size filter toggle */}
                    <button
                        type="button"
                        onClick={() => setShowSizeFilters((v) => !v)}
                        className={cx(
                            "relative flex shrink-0 items-center justify-center rounded-full transition duration-150 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                            hasActiveSizeFilter || showSizeFilters
                                ? "bg-brand-solid text-white shadow-sm"
                                : "bg-secondary text-quaternary",
                            "size-7 min-h-[44px] min-w-[44px]",
                        )}
                        aria-label="Filtrer par taille"
                    >
                        <FilterLines className="size-3.5" />
                        {hasActiveSizeFilter && (
                            <span className="absolute -right-0.5 -top-0.5 flex size-3 items-center justify-center rounded-full bg-brand-solid text-[7px] text-white">
                                {(sizeFilter ? 1 : 0) + (shoeSizeFilter ? 1 : 0)}
                            </span>
                        )}
                    </button>

                    <FilterPanel
                        categorySlug={activeCategory}
                        lat={lat}
                        lng={lng}
                        filters={filters}
                        onFiltersChange={setFilters}
                    />

                    <CategoryPills activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
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
                            <div className="mt-3 rounded-xl border-[0.5px] border-secondary bg-secondary p-3">
                                {/* Clothing size */}
                                {(availableSizes?.clothing?.length ?? 0) > 0 && (
                                    <>
                                        <p className="mb-2 text-[11px] font-medium text-tertiary">Taille vêtements</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {availableSizes!.clothing.map((s) => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    aria-pressed={sizeFilter === s}
                                                    onClick={() => { setSizeFilter(sizeFilter === s ? null : s); setShowSizeFilters(false); }}
                                                    className={cx(
                                                        "min-h-[44px] rounded-lg px-3 py-2.5 text-[11px] font-medium transition duration-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                                                        sizeFilter === s
                                                            ? "bg-brand-solid text-white"
                                                            : "bg-white text-quaternary",
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
                                        <p className={cx("mb-2 text-[11px] font-medium text-tertiary", (availableSizes?.clothing?.length ?? 0) > 0 && "mt-3")}>Pointure</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {availableSizes!.shoe.map((s) => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    aria-pressed={shoeSizeFilter === s}
                                                    onClick={() => { setShoeSizeFilter(shoeSizeFilter === s ? null : s); setShowSizeFilters(false); }}
                                                    className={cx(
                                                        "min-h-[44px] rounded-lg px-2.5 py-2.5 text-[11px] font-medium transition duration-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                                                        shoeSizeFilter === s
                                                            ? "bg-brand-solid text-white"
                                                            : "bg-white text-quaternary",
                                                    )}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {(availableSizes?.clothing?.length ?? 0) === 0 && (availableSizes?.shoe?.length ?? 0) === 0 && (
                                    <p className="text-[11px] text-tertiary">Aucune taille renseignée pour le moment.</p>
                                )}

                                {/* Reset */}
                                {hasActiveSizeFilter && (
                                    <button
                                        type="button"
                                        onClick={() => { setSizeFilter(null); setShoeSizeFilter(null); }}
                                        className="mt-2.5 min-h-[44px] text-[11px] font-medium text-brand-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none rounded"
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

            {/* ── Feed sections ── */}
            <div {...swipeHandlers}>
            <AnimatePresence mode="wait">
            {feedTab === "explorer" ? (
            <motion.div
                key="explorer"
                initial={hasMounted ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={hasMounted ? { opacity: 0 } : undefined}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-8 pb-24 pt-5"
            >

                {/* ── 1. Promos du moment — 1 grande + 3 petites ── */}
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
                            {/* Promo list — Modèle A compact (spec §2.3) */}
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
                                        onToggleFavorite={() => toggleFav(p.product_id)}
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

                {/* ── 4. Promotions — horizontal scroll ── */}
                {/* ── Followed shops ── */}
                {follows && follows.length > 0 && (
                    <section className="px-4">
                        <h2 className="font-[family-name:var(--font-archivo-black)] text-[17px] tracking-[-0.3px] text-primary">Tes boutiques</h2>
                        <div className="mt-3 flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
                            {follows.map((f: any) => {
                                const merchant = f.merchants;
                                if (!merchant) return null;
                                return (
                                    <Link
                                        key={f.merchant_id}
                                        href={`/shop/${generateSlug(f.merchants?.name || f.merchant_name || "", f.merchant_id)}`}
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
                {/* ── 6. Tout près de toi — infinite scroll ── */}
                <InfiniteProductGrid lat={lat} lng={lng} category={activeCategory} size={activeSize} filters={filters} favoriteIds={favoriteIds} onToggleFav={toggleFav} />
            </motion.div>
            ) : feedTab === "pour-toi" ? (
                <motion.div
                    key="pour-toi"
                    initial={prefersReducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <ForYouFeed follows={follows} favoriteIds={favoriteIds} onToggleFav={toggleFav} lat={lat} lng={lng} />
                </motion.div>
            ) : (
                <motion.div
                    key="suivis"
                    initial={prefersReducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <FollowedFeed follows={follows} favoriteIds={favoriteIds} onToggleFav={toggleFav} category={activeCategory} size={activeSize} />
                </motion.div>
            )}
            </AnimatePresence>
            </div>
        </div>
    );
}

/* ── Infinite scroll product grid ── */
function InfiniteProductGrid({
    lat, lng, category, size, filters, favoriteIds, onToggleFav,
}: {
    lat: number; lng: number; category: string | null; size: string | null; filters: Filters;
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
    const filtersRef = useRef(filters);

    // Reset when category, size, or filters change
    useEffect(() => {
        categoryRef.current = category;
        sizeRef.current = size;
        filtersRef.current = filters;
        setPages([]);
        pageRef.current = 1;
        hasMoreRef.current = true;
        setTotal(0);
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
                <h2 className="font-[family-name:var(--font-archivo-black)] text-[17px] tracking-[-0.3px] text-primary">Tout près de toi</h2>
                {total > 0 && <p className="mt-0.5 font-[family-name:var(--font-inter)] text-[11px] text-tertiary">{total} produits disponibles</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 px-4 md:grid-cols-4 md:gap-4 md:px-6">
                {allProducts.map((p: any, i: number) => {
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
                {!hasMoreRef.current && !loading && allProducts.length > 0 && (
                    <p className="font-[family-name:var(--font-inter)] text-[12px] text-tertiary">Tu as tout vu</p>
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
                        {/* Product image */}
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

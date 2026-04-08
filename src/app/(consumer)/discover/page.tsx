"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense, useState, useCallback, useEffect } from "react";
import { FilterLines } from "@untitledui/icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useSwipeable } from "react-swipeable";
import { SearchBar } from "../components/search-bar";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useFollows } from "../hooks/use-follows";
import { useGeolocation } from "../hooks/use-geolocation";
import { cx } from "@/utils/cx";
import { CategoryPills } from "../components/category-pills";
import { FeedHeader, type FeedTab } from "../components/feed-header";
import { FilterPanel, type Filters } from "../components/filter-panel";
import { SizeFilterPanel } from "./size-filter-panel";
import { ExplorerFeed } from "./explorer-feed";
import { ForYouFeed } from "./for-you-feed";
import { FollowedFeed } from "./followed-feed";
import { appendFilterParams } from "./types";
import type { DiscoverProduct } from "./types";

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
    const [searchQuery, setSearchQuery] = useState("");
    const handleSearch = (q: string) => {
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    };
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

    const { data: promos, isLoading: loadingPromos } = useQuery<DiscoverProduct[]>({
        queryKey: ["discover", "promos", lat, lng, activeCategory, activeSize, filters],
        queryFn: async () => {
            const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), section: "promos", radius: "10" });
            if (activeCategory) params.set("category", activeCategory);
            if (activeSize) params.set("size", activeSize);
            appendFilterParams(params, filters);
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
            appendFilterParams(params, filters);
            const res = await fetch(`/api/discover?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        staleTime: 15_000,
        enabled: isExplorer,
    });
    const { data: nearby } = useQuery<DiscoverProduct[]>({
        queryKey: ["discover", "nearby", lat, lng, activeCategory, activeSize, filters],
        queryFn: async () => {
            const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), section: "nearby", radius: "10" });
            if (activeCategory) params.set("category", activeCategory);
            if (activeSize) params.set("size", activeSize);
            appendFilterParams(params, filters);
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

    return (
        <div className="min-h-dvh bg-primary">
            <h1 className="sr-only">Découvrir — Two-Step</h1>
            <FeedHeader activeTab={feedTab} onTabChange={setFeedTab} />

            {/* ── Search bar ── */}
            {feedTab === "explorer" && (
                <div className="px-4 pt-3">
                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        onSubmit={handleSearch}
                    />
                </div>
            )}

            {/* ── Category pills + size filter (Explorer tab only) ── */}
            <div className="px-4 pb-2 pt-3">
                {feedTab === "explorer" && <>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
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

                <SizeFilterPanel
                    show={showSizeFilters}
                    availableSizes={availableSizes}
                    sizeFilter={sizeFilter}
                    shoeSizeFilter={shoeSizeFilter}
                    hasActiveSizeFilter={hasActiveSizeFilter}
                    onSizeFilterChange={setSizeFilter}
                    onShoeSizeFilterChange={setShoeSizeFilter}
                    onClose={() => setShowSizeFilters(false)}
                    onReset={() => { setSizeFilter(null); setShoeSizeFilter(null); }}
                />
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
                <ExplorerFeed
                    promos={promos}
                    loadingPromos={loadingPromos}
                    trending={trending}
                    loadingTrending={loadingTrending}
                    nearby={nearby}
                    activeCategory={activeCategory}
                    activeSize={activeSize}
                    lat={lat}
                    lng={lng}
                    filters={filters}
                    favoriteIds={favoriteIds}
                    onToggleFav={toggleFav}
                />
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

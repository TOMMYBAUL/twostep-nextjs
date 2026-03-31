"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchMd, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { ProductCard } from "../components/product-card";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useGeolocation } from "../hooks/use-geolocation";
import { useSearch, useAutocomplete } from "../hooks/use-search";
import { cx } from "@/utils/cx";
import { CONSUMER_CATEGORIES } from "@/lib/categories";

const FILTER_LABELS: Record<string, string> = {
    promos: "Promotions",
    trending: "Tendances",
};

export default function SearchPage() {
    return (
        <Suspense>
            <SearchPageInner />
        </Suspense>
    );
}

function SearchPageInner() {
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get("q") ?? "";
    const filterParam = searchParams.get("filter");
    const categoryParam = searchParams.get("category");
    const sizeParam = searchParams.get("size");
    const [query, setQuery] = useState(initialQuery);
    const [isFocused, setIsFocused] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(categoryParam);
    const { position } = useGeolocation();
    const lat = position?.lat ?? 43.6047;
    const lng = position?.lng ?? 1.4442;

    // Search mode: standard text search (with optional category filter)
    const { data: results, isLoading } = useSearch(query, lat, lng, 5, activeCategory);

    // Filter mode: discover section (promos, trending)
    const isFilterMode = !!filterParam && !query;
    const { data: filterResults, isLoading: filterLoading } = useQuery<any[]>({
        queryKey: ["discover-filter", filterParam, lat, lng, activeCategory, sizeParam],
        queryFn: async () => {
            const params = new URLSearchParams({
                section: filterParam!,
                lat: lat.toString(),
                lng: lng.toString(),
                radius: "10",
            });
            if (activeCategory) params.set("category", activeCategory);
            if (sizeParam) params.set("size", sizeParam);
            const res = await fetch(`/api/discover?${params}`);
            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();
            return data.products;
        },
        enabled: isFilterMode,
    });

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();
    const { data: suggestions } = useAutocomplete(isFocused ? query : "");

    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);

    // Which products to display
    const displayProducts = isFilterMode ? filterResults : results;
    const displayLoading = isFilterMode ? filterLoading : isLoading;
    const showPlaceholder = !query && !isFilterMode;

    return (
        <div className="min-h-dvh bg-[#FFFFFF]">
            {/* Search header */}
            <div className="bg-[#FFFFFF] px-4 pb-4 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                {/* Filter title with logo */}
                {isFilterMode && filterParam && FILTER_LABELS[filterParam] && (
                    <div className="mb-3 flex items-center gap-2">
                        <img src="/logo-icon.webp?v=2" alt="" className="size-6" />
                        <p className="font-heading text-lg font-bold uppercase text-[var(--ts-text)]">
                            {FILTER_LABELS[filterParam]}
                        </p>
                    </div>
                )}

                <div className="relative">
                    <div
                        className={cx(
                            "flex items-center gap-2.5 rounded-2xl border-2 px-4 py-3 transition duration-150",
                            isFocused ? "border-[#4268FF] shadow-[0_0_0_4px_rgba(66,104,255,0.15)]" : "border-[#E2E5F0]",
                        )}
                    >
                        <SearchMd className="size-5 text-[#1A1F36]/40" aria-hidden="true" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                            placeholder="Nike Air Max, iPhone 15, Levi's 501..."
                            className="flex-1 bg-transparent text-sm text-[#1A1F36] outline-none placeholder:text-[#1A1F36]/30"
                            aria-label="Rechercher un produit"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                className="rounded-full bg-[#E2E5F0] p-1 text-[#1A1F36]/40"
                                aria-label="Effacer"
                            >
                                <XClose className="size-3.5" />
                            </button>
                        )}
                    </div>
                    <AnimatePresence>
                        {isFocused && suggestions && suggestions.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-[#E2E5F0] shadow-xl ring-1 ring-[#1A1F36]/5"
                                role="listbox"
                                aria-label="Suggestions"
                            >
                                {suggestions.map((s, i) => (
                                    <button
                                        key={`${s.suggestion_type}-${s.suggestion}-${i}`}
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-[#1A1F36] hover:bg-[#FFFFFF]/50"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            setQuery(s.suggestion);
                                        }}
                                    >
                                        <span className="rounded-lg bg-[#FFFFFF] px-2 py-0.5 text-[10px] font-semibold text-[#1A1F36]/50">
                                            {s.suggestion_type === "product" ? "Produit" : s.suggestion_type === "brand" ? "Marque" : "Catégorie"}
                                        </span>
                                        <span>{s.suggestion}</span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Category chips — same as discover page */}
                <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide">
                    {CONSUMER_CATEGORIES.map((cat) => (
                        <button
                            key={cat.label}
                            type="button"
                            onClick={() => setActiveCategory(activeCategory === cat.value ? null : cat.value)}
                            className={cx(
                                "shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition duration-150",
                                activeCategory === cat.value
                                    ? "bg-[#4268FF] text-white shadow-sm"
                                    : "bg-[#E2E5F0] text-[#1A1F36]/60",
                            )}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Active size badge */}
                {sizeParam && (
                    <div className="mt-2 flex items-center gap-1.5">
                        <span className="rounded-lg bg-[#4268FF] px-2.5 py-1 text-[11px] font-semibold text-white">Taille {sizeParam}</span>
                    </div>
                )}
            </div>

            {/* Results */}
            <div className="p-4 pb-24">
                {showPlaceholder && (
                    <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <SearchMd className="size-10 text-[#1A1F36]/15" />
                        <p className="text-sm font-medium text-[#1A1F36]/40">
                            Tape un nom, une marque ou un code-barres
                        </p>
                    </div>
                )}

                {displayLoading && (
                    <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-[#E2E5F0]" />
                        ))}
                    </div>
                )}

                {displayProducts && displayProducts.length > 0 && (
                    <>
                        <p role="status" aria-live="polite" aria-atomic="true" className="mb-3 text-xs font-medium text-[#1A1F36]/50">
                            {displayProducts.length} résultat{displayProducts.length > 1 ? "s" : ""}
                        </p>
                        <ul role="list" className="grid grid-cols-2 gap-3">
                            {displayProducts.map((r: any) => (
                                <li key={`${r.product_id}-${r.merchant_id}`}>
                                <ProductCard
                                    id={r.product_id}
                                    name={r.product_name}
                                    price={r.product_price}
                                    photo={r.product_photo}
                                    merchantName={r.merchant_name}
                                    distance={r.distance_km}
                                    stockQuantity={r.stock_quantity}
                                    salePrice={r.sale_price}
                                    isFavorite={favoriteIds.has(r.product_id)}
                                    onToggleFavorite={() => {
                                        if (favoriteIds.has(r.product_id)) remove.mutate(r.product_id);
                                        else add.mutate(r.product_id);
                                    }}
                                />
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {displayProducts && displayProducts.length === 0 && !showPlaceholder && (
                    <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <p className="text-sm font-medium text-[#1A1F36]/40">
                            {isFilterMode
                                ? "Aucun résultat avec ces filtres"
                                : `Aucun résultat pour \u201c${query}\u201d`}
                        </p>
                        {!isFilterMode && (
                            <p className="text-xs text-[#1A1F36]/30">
                                Essaie avec un autre terme
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

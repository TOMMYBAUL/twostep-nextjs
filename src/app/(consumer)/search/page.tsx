"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchMd, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "../components/product-card";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useGeolocation } from "../hooks/use-geolocation";
import { useSearch, useAutocomplete } from "../hooks/use-search";
import { cx } from "@/utils/cx";

const CATEGORIES = ["Mode", "Tech", "Sport", "Maison", "Beauté", "Jouets", "Bijoux"];

const FILTER_LABELS: Record<string, string> = {
    promos: "Promos du moment",
    trending: "Tendances",
    nearby: "Disponible maintenant",
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
    const [query, setQuery] = useState(initialQuery);
    const [isFocused, setIsFocused] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const { position } = useGeolocation();
    const lat = position?.lat ?? 43.6047;
    const lng = position?.lng ?? 1.4442;

    // Search mode: standard text search
    const { data: results, isLoading } = useSearch(query, lat, lng);

    // Filter mode: discover section (promos, trending, nearby)
    const isFilterMode = !!filterParam && !query;
    const { data: filterResults, isLoading: filterLoading } = useQuery<any[]>({
        queryKey: ["discover-filter", filterParam, lat, lng],
        queryFn: async () => {
            const params = new URLSearchParams({
                section: filterParam!,
                lat: lat.toString(),
                lng: lng.toString(),
                radius: "10",
            });
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
        <div className="min-h-dvh bg-[#2C1A0E]">
            {/* Search header */}
            <div className="bg-[#2C1A0E] px-4 pb-4 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                {/* Filter title */}
                {isFilterMode && filterParam && FILTER_LABELS[filterParam] && (
                    <p className="mb-3 font-display text-lg font-bold text-[#F5EDD8]">
                        {FILTER_LABELS[filterParam]}
                    </p>
                )}

                <div className="relative">
                    <div
                        className={cx(
                            "flex items-center gap-2.5 rounded-2xl border-2 px-4 py-3 transition duration-150",
                            isFocused ? "border-[#C17B2F] shadow-[0_0_0_4px_rgba(193,123,47,0.15)]" : "border-[#3D2A1A]",
                        )}
                    >
                        <SearchMd className="size-5 text-[#F5EDD8]/40" aria-hidden="true" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                            placeholder="Nike Air Max, iPhone 15, Levi's 501..."
                            className="flex-1 bg-transparent text-sm text-[#F5EDD8] outline-none placeholder:text-[#F5EDD8]/30"
                            aria-label="Rechercher un produit"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                className="rounded-full bg-[#3D2A1A] p-1 text-[#F5EDD8]/40"
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
                                className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-[#3D2A1A] shadow-xl ring-1 ring-[#F5EDD8]/5"
                            >
                                {suggestions.map((s, i) => (
                                    <button
                                        key={`${s.suggestion_type}-${s.suggestion}-${i}`}
                                        type="button"
                                        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-[#F5EDD8] hover:bg-[#2C1A0E]/50"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            setQuery(s.suggestion);
                                        }}
                                    >
                                        <span className="rounded-lg bg-[#2C1A0E] px-2 py-0.5 text-[10px] font-semibold text-[#F5EDD8]/50">
                                            {s.suggestion_type === "product" ? "Produit" : s.suggestion_type === "brand" ? "Marque" : "Catégorie"}
                                        </span>
                                        <span>{s.suggestion}</span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Category chips */}
                <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => {
                                setActiveCategory(activeCategory === cat ? null : cat);
                                setQuery(activeCategory === cat ? "" : cat);
                            }}
                            className={cx(
                                "shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition duration-150",
                                activeCategory === cat
                                    ? "bg-[#C17B2F] text-white shadow-sm"
                                    : "bg-[#3D2A1A] text-[#F5EDD8]/60",
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results */}
            <div className="p-4">
                {showPlaceholder && (
                    <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <SearchMd className="size-10 text-[#F5EDD8]/15" />
                        <p className="text-sm font-medium text-[#F5EDD8]/40">
                            Tape un nom, une marque ou un code-barres
                        </p>
                    </div>
                )}

                {displayLoading && (
                    <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-[#3D2A1A]" />
                        ))}
                    </div>
                )}

                {displayProducts && displayProducts.length > 0 && (
                    <>
                        <p className="mb-3 text-xs font-medium text-[#F5EDD8]/50">
                            {displayProducts.length} résultat{displayProducts.length > 1 ? "s" : ""}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {displayProducts.map((r: any) => (
                                <ProductCard
                                    key={`${r.product_id}-${r.merchant_id}`}
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
                            ))}
                        </div>
                    </>
                )}

                {displayProducts && displayProducts.length === 0 && !showPlaceholder && (
                    <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <p className="text-sm font-medium text-[#F5EDD8]/40">
                            {isFilterMode
                                ? "Aucune promo disponible pour le moment"
                                : `Aucun résultat pour \u201c${query}\u201d`}
                        </p>
                        {!isFilterMode && (
                            <p className="text-xs text-[#F5EDD8]/30">
                                Essaie avec un autre terme
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchMd } from "@untitledui/icons";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "../components/product-card";
import { SearchBar } from "../components/search-bar";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useGeolocation } from "../hooks/use-geolocation";
import { useSearch } from "../hooks/use-search";
import { CategoryPills } from "../components/category-pills";

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

    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);

    // Which products to display
    const displayProducts = isFilterMode ? filterResults : results;
    const displayLoading = isFilterMode ? filterLoading : isLoading;
    const showPlaceholder = !query && !isFilterMode;

    return (
        <div className="min-h-dvh bg-primary">
            {/* Search header */}
            <div className="bg-primary px-4 pb-4 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <SearchBar
                    value={query}
                    onChange={setQuery}
                    onSubmit={setQuery}
                />

                {/* Category chips */}
                <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide">
                    <CategoryPills activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
                </div>

                {/* Active size badge */}
                {sizeParam && (
                    <div className="mt-2 flex items-center gap-1.5">
                        <span className="rounded-lg bg-brand-solid px-2.5 py-1 text-[11px] font-semibold text-white">
                            Taille {sizeParam}
                        </span>
                    </div>
                )}
            </div>

            {/* Results */}
            <div className="p-4 pb-24">
                {showPlaceholder && (
                    <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <SearchMd className="size-10 text-quaternary" aria-hidden="true" />
                        <p className="text-sm font-medium text-quaternary">
                            Tape un nom, une marque ou un code-barres
                        </p>
                    </div>
                )}

                {displayLoading && (
                    <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-secondary_hover" />
                        ))}
                    </div>
                )}

                {displayProducts && displayProducts.length > 0 && (
                    <>
                        <p role="status" aria-live="polite" aria-atomic="true" className="mb-3 text-xs font-medium text-tertiary">
                            {displayProducts.length} résultat{displayProducts.length > 1 ? "s" : ""}
                        </p>
                        <ul role="list" className="grid grid-cols-2 gap-3">
                            {displayProducts.map((r: any, i: number) => (
                                <li key={`${r.product_id}-${r.merchant_id}`}>
                                <ProductCard
                                    index={i}
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
                        <p className="text-sm font-medium text-quaternary">
                            {isFilterMode
                                ? "Aucun résultat avec ces filtres"
                                : `Aucun résultat pour \u201c${query}\u201d`}
                        </p>
                        {!isFilterMode && (
                            <p className="text-xs text-tertiary">
                                Essaie avec un autre terme
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

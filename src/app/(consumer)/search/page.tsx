"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchMd, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { ProductCard } from "../components/product-card";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useGeolocation } from "../hooks/use-geolocation";
import { useSearch, useAutocomplete } from "../hooks/use-search";
import { cx } from "@/utils/cx";

const CATEGORIES = ["Mode", "Tech", "Sport", "Maison", "Beauté", "Jouets", "Bijoux"];

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
    const [query, setQuery] = useState(initialQuery);
    const [isFocused, setIsFocused] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const { position } = useGeolocation();
    const { data: results, isLoading } = useSearch(
        query,
        position?.lat ?? 43.6047,
        position?.lng ?? 1.4442,
    );
    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();
    const { data: suggestions } = useAutocomplete(isFocused ? query : "");

    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);

    return (
        <div className="min-h-dvh bg-[var(--ts-cream)]">
            {/* Search header */}
            <div className="bg-white px-4 pb-4 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="relative">
                    <div
                        className={cx(
                            "flex items-center gap-2.5 rounded-2xl border-2 px-4 py-3 transition duration-150",
                            isFocused ? "border-[var(--ts-ochre)] shadow-[0_0_0_4px_rgba(200,129,58,0.1)]" : "border-[var(--ts-cream-dark)]",
                        )}
                    >
                        <SearchMd className="size-5 text-[var(--ts-brown-mid)]/40" aria-hidden="true" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                            placeholder="Nike Air Max, iPhone 15, Levi's 501..."
                            className="flex-1 bg-transparent text-sm text-[var(--ts-brown)] outline-none placeholder:text-[var(--ts-brown-mid)]/30"
                            aria-label="Rechercher un produit"
                            autoFocus
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                className="rounded-full bg-[var(--ts-cream)] p-1 text-[var(--ts-brown-mid)]/40"
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
                                className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white shadow-xl"
                            >
                                {suggestions.map((s, i) => (
                                    <button
                                        key={`${s.suggestion_type}-${s.suggestion}-${i}`}
                                        type="button"
                                        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-[var(--ts-brown)] hover:bg-[var(--ts-cream)]/50"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            setQuery(s.suggestion);
                                        }}
                                    >
                                        <span className="rounded-lg bg-[var(--ts-cream)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ts-brown-mid)]">
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
                                    ? "bg-[var(--ts-ochre)] text-white"
                                    : "bg-[var(--ts-cream)] text-[var(--ts-brown-mid)]",
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results */}
            <div className="p-4">
                {!query && (
                    <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <SearchMd className="size-10 text-[var(--ts-brown-mid)]/15" />
                        <p className="text-sm font-medium text-[var(--ts-brown-mid)]/40">
                            Tape un nom, une marque ou un code-barres
                        </p>
                    </div>
                )}

                {isLoading && query.length >= 2 && (
                    <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-white" />
                        ))}
                    </div>
                )}

                {results && results.length > 0 && (
                    <>
                        <p className="mb-3 text-xs font-medium text-[var(--ts-brown-mid)]/50">
                            {results.length} résultat{results.length > 1 ? "s" : ""}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {results.map((r) => (
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

                {results && results.length === 0 && query.length >= 2 && (
                    <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <p className="text-sm font-medium text-[var(--ts-brown-mid)]/40">
                            Aucun résultat pour "{query}"
                        </p>
                        <p className="text-xs text-[var(--ts-brown-mid)]/30">
                            Essaie avec un autre terme
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

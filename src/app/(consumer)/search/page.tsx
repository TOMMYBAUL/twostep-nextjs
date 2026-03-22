"use client";

import { useState } from "react";
import { ProductCard } from "../components/product-card";
import { SearchBar } from "../components/search-bar";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useGeolocation } from "../hooks/use-geolocation";
import { useSearch } from "../hooks/use-search";

export default function SearchPage() {
    const [query, setQuery] = useState("");
    const { position } = useGeolocation();
    const { data: results, isLoading } = useSearch(
        query,
        position?.lat ?? 43.6047,
        position?.lng ?? 1.4442,
    );
    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();

    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);

    return (
        <div className="flex flex-col gap-4 p-4">
            <SearchBar value={query} onChange={setQuery} />

            {!query && (
                <p className="py-12 text-center text-sm text-tertiary">
                    Recherchez un produit par nom, marque ou code-barres
                </p>
            )}

            {isLoading && query.length >= 2 && (
                <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-secondary" />
                    ))}
                </div>
            )}

            {results && results.length > 0 && (
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
                                if (favoriteIds.has(r.product_id)) {
                                    remove.mutate(r.product_id);
                                } else {
                                    add.mutate(r.product_id);
                                }
                            }}
                        />
                    ))}
                </div>
            )}

            {results && results.length === 0 && query.length >= 2 && (
                <p className="py-12 text-center text-sm text-tertiary">
                    Aucun résultat pour "{query}"
                </p>
            )}
        </div>
    );
}

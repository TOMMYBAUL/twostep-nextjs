"use client";

import { useQuery } from "@tanstack/react-query";
import { Tag01, TrendUp01, ShoppingBag01 } from "@untitledui/icons";
import { ProductCard } from "../components/product-card";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useGeolocation } from "../hooks/use-geolocation";

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

    const { data: promos, isLoading: loadingPromos } = useDiscoverFeed(lat, lng, "promos");
    const { data: trending, isLoading: loadingTrending } = useDiscoverFeed(lat, lng, "trending");
    const { data: nearby, isLoading: loadingNearby } = useDiscoverFeed(lat, lng, "nearby");

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();
    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);

    const toggleFav = (id: string) => {
        if (favoriteIds.has(id)) remove.mutate(id);
        else add.mutate(id);
    };

    return (
        <div className="flex flex-col gap-6 px-4 pb-20 pt-4">
            <div>
                <h1 className="font-display text-xl font-bold text-primary">Découvrir</h1>
                <p className="mt-0.5 text-sm text-tertiary">
                    Les meilleurs produits autour de toi
                </p>
            </div>

            {/* Promos section */}
            <Section
                icon={<Tag01 className="size-4 text-[var(--ts-ochre)]" />}
                title="Promotions"
                subtitle="Les bons plans du moment"
                products={promos}
                isLoading={loadingPromos}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFav}
            />

            {/* Trending section */}
            <Section
                icon={<TrendUp01 className="size-4 text-[var(--ts-sage)]" />}
                title="Tendances"
                subtitle="Les plus populaires autour de toi"
                products={trending}
                isLoading={loadingTrending}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFav}
            />

            {/* Nearby section */}
            <Section
                icon={<ShoppingBag01 className="size-4 text-[var(--ts-brown)]" />}
                title="À côté de toi"
                subtitle="Stock disponible maintenant"
                products={nearby}
                isLoading={loadingNearby}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFav}
            />
        </div>
    );
}

function Section({
    icon,
    title,
    subtitle,
    products,
    isLoading,
    favoriteIds,
    onToggleFavorite,
}: {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    products?: DiscoverProduct[];
    isLoading: boolean;
    favoriteIds: Set<string>;
    onToggleFavorite: (id: string) => void;
}) {
    return (
        <section>
            <div className="mb-3 flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-secondary">
                    {icon}
                </div>
                <div>
                    <h2 className="text-sm font-semibold text-primary">{title}</h2>
                    <p className="text-[11px] text-tertiary">{subtitle}</p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex gap-3 overflow-x-auto">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="aspect-[3/4] w-40 shrink-0 animate-pulse rounded-2xl bg-secondary" />
                    ))}
                </div>
            ) : products && products.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
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
                            className="w-40 shrink-0"
                        />
                    ))}
                </div>
            ) : (
                <div className="rounded-xl border border-secondary bg-secondary/50 px-4 py-6 text-center">
                    <p className="text-xs text-tertiary">Pas encore de contenu dans cette section</p>
                </div>
            )}
        </section>
    );
}

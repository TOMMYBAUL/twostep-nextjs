"use client";

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { HeartButton } from "../components/heart-button";
import { StockBadge } from "../components/stock-badge";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useGeolocation } from "../hooks/use-geolocation";
import { generateSlug } from "@/lib/slug";

export default function FavoritesPage() {
    const { data: favorites, isLoading: loadingFavs } = useFavorites();
    const { remove } = useToggleFavorite();

    const hasFavs = !!favorites && favorites.length > 0;

    return (
        <div className="min-h-dvh bg-secondary">
            {/* Header */}
            <div className="bg-secondary" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="flex items-center gap-2.5 px-4 pb-4">
                    <img src="/logo-icon.webp?v=2" alt="" className="size-7" aria-hidden="true" />
                    <h1 className="font-heading text-xl font-bold uppercase text-primary">Favoris</h1>
                    {favorites && favorites.length > 0 && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-tertiary">
                            {favorites.length}
                        </span>
                    )}
                </div>
            </div>

            <div className="p-4 pb-24">
                <div className="space-y-2">
                    {loadingFavs ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />
                        ))
                    ) : !hasFavs ? (
                        <EmptyStateWithSuggestions />
                    ) : (
                        favorites.filter((fav: any) => fav.products).map((fav: any) => {
                            const product = fav.products;
                            const quantity = product.stock?.[0]?.quantity ?? 0;
                            const merchant = product.merchants;

                            return (
                                <Link
                                    key={fav.product_id}
                                    href={`/product/${generateSlug(product.name || "", fav.product_id)}`}
                                    className="flex gap-3 rounded-2xl bg-secondary p-3 transition duration-150 active:scale-[0.98] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none min-h-[44px]"
                                >
                                    <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-secondary">
                                        {(product.photo_processed_url ?? product.photo_url) ? (
                                            <Image src={product.photo_processed_url ?? product.photo_url ?? "/placeholder-product.svg"} alt={product.canonical_name ?? product.name ?? ""} width={80} height={80} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-lg font-bold text-primary/15">
                                                {(product.canonical_name ?? product.name)?.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-1 flex-col justify-between py-0.5">
                                        <div>
                                            <h3 className="text-[13px] font-medium text-primary">{product.canonical_name ?? product.name}</h3>
                                            <p className="mt-0.5 text-xs font-normal text-tertiary">{(product.price ?? 0).toFixed(2)} €</p>
                                            {merchant && (
                                                <p className="mt-0.5 text-[11px] text-tertiary">{merchant.name}</p>
                                            )}
                                        </div>
                                        <StockBadge quantity={quantity} />
                                    </div>
                                    <div className="shrink-0 pt-0.5">
                                        <HeartButton
                                            isFavorite
                                            onToggle={() => remove.mutate(fav.product_id)}
                                            ariaLabel={`Retirer ${product.canonical_name ?? product.name} des favoris`}
                                        />
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

/* ── Empty state with discovery suggestions ── */
function EmptyStateWithSuggestions() {
    const { position } = useGeolocation();
    const lat = position?.lat ?? 43.6047;
    const lng = position?.lng ?? 1.4442;

    const { data: trending } = useQuery<any[]>({
        queryKey: ["discover", "trending", lat, lng, null],
        queryFn: async () => {
            const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), section: "trending", radius: "10" });
            const res = await fetch(`/api/discover?${params}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.products ?? [];
        },
        staleTime: 60_000,
    });

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();
    const favoriteIds = new Set(favorites?.map((f: any) => f.product_id) ?? []);

    const suggestions = (trending ?? []).slice(0, 4);

    return (
        <div className="pb-20 pt-4">
            {/* Title */}
            <p className="text-[17px] font-bold text-primary tracking-[-0.2px]">
                Commence ta liste
            </p>

            {/* Subtitle */}
            <p className="mt-2 text-[13px] leading-relaxed text-tertiary">
                Appuie sur ♡ sur un produit pour le sauvegarder ici. Retrouve-le avant qu&apos;il disparaisse.
            </p>

            {/* CTA */}
            <Link
                href="/discover"
                className="mt-4 inline-flex items-center gap-1.5 rounded-[20px] border-[0.5px] border-brand bg-transparent px-4 py-2 text-xs font-medium text-brand-secondary transition active:opacity-80 min-h-[44px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
                Explorer les boutiques &rarr;
            </Link>

            {/* Product suggestions — 2×2 grid */}
            {suggestions.length > 0 && (
                <div className="mt-6">
                    <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.8px] text-tertiary">
                        À découvrir autour de toi
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {suggestions.map((p: any) => {
                            const isFav = favoriteIds.has(p.product_id);
                            return (
                                <Link
                                    key={p.product_id}
                                    href={`/product/${generateSlug(p.product_name, p.product_id)}`}
                                    className="overflow-hidden rounded-xl bg-secondary border border-secondary transition active:opacity-80 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                >
                                    <div className="relative h-[130px] w-full bg-secondary">
                                        {p.product_photo ? (
                                            <Image src={p.product_photo} alt={p.product_name ?? ""} fill sizes="50vw" className="object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-lg text-tertiary/30" aria-hidden="true">
                                                {p.product_name?.charAt(0)}
                                            </div>
                                        )}
                                        <div className="absolute right-[7px] top-[7px]" role="presentation" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} onKeyDown={(e) => { e.stopPropagation(); }}>
                                            <HeartButton
                                                isFavorite={isFav}
                                                onToggle={() => {
                                                    if (isFav) remove.mutate(p.product_id);
                                                    else add.mutate(p.product_id);
                                                }}
                                                ariaLabel={`${isFav ? "Retirer" : "Ajouter"} ${p.product_name} des favoris`}
                                            />
                                        </div>
                                    </div>
                                    <div className="px-2 py-[7px]">
                                        <p className="truncate text-[11px] font-medium text-primary">{p.product_name}</p>
                                        <p className="mt-0.5 text-[10px] text-tertiary">{p.merchant_name}</p>
                                        <p className="mt-0.5 text-[11px] text-tertiary">{(p.sale_price ?? p.product_price)?.toFixed(2)} €</p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

        </div>
    );
}

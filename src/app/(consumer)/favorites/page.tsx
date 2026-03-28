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
        <div className="min-h-dvh bg-[#1C1209]" style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif" }}>
            {/* Header */}
            <div className="bg-[#1C1209]" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="flex items-center gap-2.5 px-4 pb-4">
                    <img src="/logo-icon.webp" alt="" className="size-7" />
                    <h1 className="font-display text-xl font-bold text-[#f5deb3]">Favoris</h1>
                    {favorites && favorites.length > 0 && (
                        <span className="rounded-full bg-[#2a1a08] px-2 py-0.5 text-[10px] font-semibold text-[#a07840]">
                            {favorites.length}
                        </span>
                    )}
                </div>
            </div>

            <div className="p-4 pb-24">
                <div className="space-y-2">
                    {loadingFavs ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#2a1a08]" />
                        ))
                    ) : !hasFavs ? (
                        <EmptyStateWithSuggestions />
                    ) : (
                        favorites.map((fav: any) => {
                            const product = fav.products;
                            if (!product) return null;
                            const quantity = product.stock?.[0]?.quantity ?? 0;
                            const merchant = product.merchants;

                            return (
                                <Link
                                    key={fav.product_id}
                                    href={`/product/${generateSlug(product.name || "", fav.product_id)}`}
                                    className="flex gap-3 rounded-2xl bg-[#2a1a08] p-3 transition duration-150 active:scale-[0.98]"
                                >
                                    <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-[#1C1209]">
                                        {(product.photo_processed_url ?? product.photo_url) ? (
                                            <img src={product.photo_processed_url ?? product.photo_url ?? "/placeholder-product.svg"} alt={product.name} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-lg font-bold text-[#f5deb3]/20">
                                                {product.name?.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-1 flex-col justify-between py-0.5">
                                        <div>
                                            <h3 className="text-[13px] font-medium text-[#f5deb3]">{product.name}</h3>
                                            <p className="mt-0.5 text-xs font-normal text-[#a07840]">{product.price?.toFixed(2)} €</p>
                                            {merchant && (
                                                <p className="mt-0.5 text-[11px] text-[#5a4020]">{merchant.name}</p>
                                            )}
                                        </div>
                                        <StockBadge quantity={quantity} />
                                    </div>
                                    <div className="shrink-0 pt-0.5">
                                        <HeartButton
                                            isFavorite
                                            onToggle={() => remove.mutate(fav.product_id)}
                                            ariaLabel={`Retirer ${product.name} des favoris`}
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
            {/* Editorial banner */}
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-[#1e1409] px-3.5 py-3" style={{ border: "0.5px solid rgba(200,120,48,0.15)" }}>
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg text-sm" style={{ background: "rgba(200,120,48,0.1)" }}>
                    💡
                </div>
                <div>
                    <p className="text-xs font-semibold text-[#e8d4b0]">Ton espace de curation</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#5a4020]">
                        Sauvegarde les produits et boutiques qui t&apos;intéressent. Retrouve-les ici avant qu&apos;ils disparaissent.
                    </p>
                </div>
            </div>

            {/* Title */}
            <p className="text-[17px] font-bold text-[#f0dfc0]" style={{ letterSpacing: "-0.2px" }}>
                Commence ta liste
            </p>

            {/* Subtitle */}
            <p className="mt-2 text-[13px] leading-relaxed text-[#5a4020]">
                Appuie sur ♡ sur un produit pour le sauvegarder ici.
            </p>

            {/* CTA */}
            <Link
                href="/discover"
                className="mt-4 inline-flex items-center gap-1.5 rounded-[20px] border-[0.5px] border-[#c87830] bg-transparent px-4 py-2 text-xs font-medium text-[#c87830] transition active:opacity-80"
            >
                Explorer les boutiques &rarr;
            </Link>

            {/* Product suggestions — 2×2 grid */}
            {suggestions.length > 0 && (
                <div className="mt-6">
                    <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.8px] text-[#5a4020]">
                        À découvrir autour de toi
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        {suggestions.map((p: any) => {
                            const isFav = favoriteIds.has(p.product_id);
                            return (
                                <Link
                                    key={p.product_id}
                                    href={`/product/${generateSlug(p.product_name, p.product_id)}`}
                                    className="overflow-hidden rounded-xl bg-[#1e1409] transition active:opacity-80"
                                    style={{ border: "0.5px solid rgba(255,255,255,0.05)" }}
                                >
                                    <div className="relative h-[130px] w-full bg-[#2a1c0a]">
                                        {p.product_photo ? (
                                            <Image src={p.product_photo} alt={p.product_name} fill sizes="50vw" className="object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-lg text-[#5a4020]/30">
                                                {p.product_name?.charAt(0)}
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (isFav) remove.mutate(p.product_id);
                                                else add.mutate(p.product_id);
                                            }}
                                            className="absolute right-[7px] top-[7px] flex size-6 items-center justify-center rounded-full text-[11px] text-[#f0dfc0]"
                                            style={{ background: "rgba(19,14,7,0.6)" }}
                                        >
                                            {isFav ? "♥" : "♡"}
                                        </button>
                                    </div>
                                    <div className="px-2 py-[7px]">
                                        <p className="truncate text-[11px] font-medium text-[#e8d4b0]">{p.product_name}</p>
                                        <p className="mt-0.5 text-[10px] text-[#5a4020]">{p.merchant_name}</p>
                                        <p className="mt-0.5 text-[11px] text-[#a07840]">{(p.sale_price ?? p.product_price)?.toFixed(2)} €</p>
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

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { MarkerPin01 } from "@untitledui/icons";
import { HeartButton } from "../components/heart-button";
import { StockBadge } from "../components/stock-badge";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useFollows, useToggleFollow } from "../hooks/use-follows";
import { useGeolocation } from "../hooks/use-geolocation";
import { cx } from "@/utils/cx";
import { generateSlug } from "@/lib/slug";

type Tab = "produits" | "boutiques";

export default function FavoritesPage() {
    const [activeTab, setActiveTab] = useState<Tab>("produits");
    const { data: favorites, isLoading: loadingFavs } = useFavorites();
    const { data: follows, isLoading: loadingFollows } = useFollows();
    const { remove } = useToggleFavorite();
    const { unfollow } = useToggleFollow();

    const hasFavs = !!favorites && favorites.length > 0;
    const hasFollows = !!follows && follows.length > 0;
    const showEmpty = activeTab === "produits" ? (!loadingFavs && !hasFavs) : (!loadingFollows && !hasFollows);

    return (
        <div className="min-h-dvh bg-[#1C1209]" style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif" }}>
            {/* Header */}
            <div className="bg-[#1C1209]" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="flex items-center gap-2.5 px-4 pb-2">
                    <img src="/logo-icon.webp" alt="" className="size-7" />
                    <h1 className="font-display text-xl font-bold text-[#f5deb3]">Favoris</h1>
                </div>
                {/* Tabs */}
                <div className="flex" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
                    {(["produits", "boutiques"] as Tab[]).map((tab) => {
                        const isActive = activeTab === tab;
                        const label = tab === "produits"
                            ? `Produits${favorites?.length ? ` (${favorites.length})` : ""}`
                            : `Boutiques${follows?.length ? ` (${follows.length})` : ""}`;
                        return (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setActiveTab(tab)}
                                className="relative flex-1 py-3 text-center text-[13px] font-medium transition duration-150"
                                style={{ color: isActive ? "#c87830" : "#5a4020" }}
                            >
                                {label}
                                {isActive && (
                                    <span
                                        className="absolute bottom-0 left-[20%] right-[20%] h-[2px]"
                                        style={{ background: "#c87830", borderRadius: "2px 2px 0 0" }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="p-4 pb-24">
                {activeTab === "produits" && (
                    <div className="space-y-2">
                        {loadingFavs ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#2a1a08]" />
                            ))
                        ) : !hasFavs ? (
                            <EmptyStateWithSuggestions tab="produits" />
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
                                            {product.photo_url ? (
                                                <img src={product.photo_url} alt={product.name} className="h-full w-full object-cover" />
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
                )}

                {activeTab === "boutiques" && (
                    <div className="space-y-2">
                        {loadingFollows ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-20 animate-pulse rounded-2xl bg-[#2a1a08]" />
                            ))
                        ) : !hasFollows ? (
                            <EmptyStateWithSuggestions tab="boutiques" />
                        ) : (
                            follows.map((f: any) => {
                                const merchant = f.merchants;
                                if (!merchant) return null;
                                return (
                                    <Link
                                        key={f.merchant_id}
                                        href={`/shop/${generateSlug(f.merchants?.name || "", f.merchant_id)}`}
                                        className="flex items-center gap-3 rounded-2xl bg-[#2a1a08] p-3 transition duration-150 active:scale-[0.98]"
                                    >
                                        <div className="size-13 shrink-0 overflow-hidden rounded-full bg-[#1C1209]">
                                            {merchant.photo_url ? (
                                                <img src={merchant.photo_url} alt={merchant.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-lg font-bold text-[#c87830]">
                                                    {merchant.name?.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-[13px] font-medium text-[#f5deb3]">{merchant.name}</h3>
                                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#5a4020]">
                                                <MarkerPin01 className="size-3" aria-hidden="true" />
                                                {merchant.city}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                unfollow.mutate(f.merchant_id);
                                            }}
                                            className="shrink-0 rounded-xl border border-[#f5deb3]/20 px-3 py-1.5 text-xs font-semibold text-[#f5deb3]/70 transition duration-150 active:bg-[#2a1a08]"
                                        >
                                            Suivi ✓
                                        </button>
                                    </Link>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Empty state with trending suggestions ── */
function EmptyStateWithSuggestions({ tab }: { tab: Tab }) {
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

    const suggestions = (trending ?? []).slice(0, 3);

    return (
        <div className="flex flex-col items-center pt-12">
            {/* Icon */}
            <div
                className="flex items-center justify-center"
                style={{
                    width: 64,
                    height: 64,
                    borderRadius: 20,
                    background: "rgba(200,120,48,0.1)",
                    border: "0.5px solid rgba(200,120,48,0.2)",
                }}
            >
                <span style={{ fontSize: 28, color: "#c87830" }}>♡</span>
            </div>

            {/* Title */}
            <p className="mt-5 text-[17px] font-semibold text-[#e8d4b0]" style={{ letterSpacing: "-0.2px" }}>
                Rien ici pour l'instant
            </p>

            {/* Subtitle */}
            <p className="mt-2 max-w-[220px] text-center text-[13px] leading-relaxed text-[#5a4020]">
                {tab === "produits"
                    ? "Appuie sur le cœur d'un produit pour le retrouver ici."
                    : "Suis une boutique pour ne rien rater de ses nouveautés."}
            </p>

            {/* CTA */}
            <Link
                href="/discover"
                className="mt-7 rounded-3xl bg-[#c87830] px-7 py-3 text-[13px] font-semibold text-[#130e07] transition active:opacity-80"
            >
                Explorer les boutiques
            </Link>

            {/* Suggestions */}
            {suggestions.length > 0 && (
                <div className="mt-9 w-full">
                    <p className="mb-3 text-center text-[10px] font-medium uppercase tracking-[0.8px] text-[#5a4020]">
                        Tendances près de toi
                    </p>
                    <div className="flex gap-2">
                        {suggestions.map((p: any) => (
                            <Link
                                key={p.product_id}
                                href={`/product/${generateSlug(p.product_name, p.product_id)}`}
                                className="flex-1 overflow-hidden rounded-xl bg-[#1e1409] transition active:opacity-80"
                                style={{ border: "0.5px solid rgba(255,255,255,0.05)" }}
                            >
                                <div className="relative h-[140px] w-full bg-[#2a1c0a]">
                                    {p.product_photo ? (
                                        <Image src={p.product_photo} alt={p.product_name} fill sizes="33vw" className="object-cover" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-lg text-[#5a4020]/30">
                                            {p.product_name?.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="px-2 py-[7px]">
                                    <p className="truncate text-xs font-medium text-[#e8d4b0]">{p.product_name}</p>
                                    <p className="mt-0.5 text-[11px] text-[#a07840]">{(p.sale_price ?? p.product_price)?.toFixed(2)} €</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

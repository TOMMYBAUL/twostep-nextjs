"use client";

import { useState } from "react";
import Link from "next/link";
import { MarkerPin01 } from "@untitledui/icons";
import { HeartButton } from "../components/heart-button";
import { StockBadge } from "../components/stock-badge";
import { useFavorites, useToggleFavorite } from "../hooks/use-favorites";
import { useFollows, useToggleFollow } from "../hooks/use-follows";
import { cx } from "@/utils/cx";

type Tab = "produits" | "boutiques";

export default function FavoritesPage() {
    const [activeTab, setActiveTab] = useState<Tab>("produits");
    const { data: favorites, isLoading: loadingFavs } = useFavorites();
    const { data: follows, isLoading: loadingFollows } = useFollows();
    const { remove } = useToggleFavorite();
    const { unfollow } = useToggleFollow();

    return (
        <div className="min-h-dvh bg-[#2C1A0E]">
            {/* Header */}
            <div className="bg-[#2C1A0E]" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="flex items-center gap-2.5 px-4 pb-2">
                    <img src="/logo-icon.webp" alt="" className="size-7" />
                    <h1 className="font-display text-xl font-bold text-[#F5EDD8]">Favoris</h1>
                </div>
                <div className="flex border-b border-[#3D2A1A]">
                    {(["produits", "boutiques"] as Tab[]).map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={cx(
                                "flex-1 border-b-2 py-3 text-center text-sm font-semibold transition duration-150",
                                activeTab === tab
                                    ? "border-[#C17B2F] text-[#C17B2F]"
                                    : "border-transparent text-[#F5EDD8]/40",
                            )}
                        >
                            {tab === "produits" ? `Produits${favorites?.length ? ` (${favorites.length})` : ""}` : `Boutiques${follows?.length ? ` (${follows.length})` : ""}`}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 pb-24">
                {activeTab === "produits" && (
                    <div className="space-y-2">
                        {loadingFavs ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#3D2A1A]" />
                            ))
                        ) : !favorites || favorites.length === 0 ? (
                            <EmptyState emoji="❤️" title="Aucun favori" description="Ajoute des produits en appuyant sur le cœur" />
                        ) : (
                            favorites.map((fav: any) => {
                                const product = fav.products;
                                if (!product) return null;
                                const quantity = product.stock?.[0]?.quantity ?? 0;
                                const merchant = product.merchants;

                                return (
                                    <Link
                                        key={fav.product_id}
                                        href={`/product/${fav.product_id}`}
                                        className="flex gap-3 rounded-2xl bg-[#3D2A1A] p-3 transition duration-150 active:scale-[0.98]"
                                    >
                                        <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-[#2C1A0E]">
                                            {product.photo_url ? (
                                                <img src={product.photo_url} alt={product.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-lg font-bold text-[#F5EDD8]/20">
                                                    {product.name?.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-1 flex-col justify-between py-0.5">
                                            <div>
                                                <h3 className="text-[13px] font-semibold text-[#F5EDD8]">{product.name}</h3>
                                                <p className="mt-0.5 text-sm font-bold text-[#F5EDD8]">{product.price?.toFixed(2)} €</p>
                                                {merchant && (
                                                    <p className="mt-0.5 text-[11px] text-[#F5EDD8]/50">{merchant.name}</p>
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
                                <div key={i} className="h-20 animate-pulse rounded-2xl bg-[#3D2A1A]" />
                            ))
                        ) : !follows || follows.length === 0 ? (
                            <EmptyState emoji="🏪" title="Aucune boutique suivie" description="Suis tes boutiques préférées pour ne rien rater" />
                        ) : (
                            follows.map((f: any) => {
                                const merchant = f.merchants;
                                if (!merchant) return null;
                                return (
                                    <Link
                                        key={f.merchant_id}
                                        href={`/shop/${f.merchant_id}`}
                                        className="flex items-center gap-3 rounded-2xl bg-[#3D2A1A] p-3 transition duration-150 active:scale-[0.98]"
                                    >
                                        <div className="size-13 shrink-0 overflow-hidden rounded-full bg-[#2C1A0E]">
                                            {merchant.photo_url ? (
                                                <img src={merchant.photo_url} alt={merchant.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-lg font-bold text-[#C17B2F]">
                                                    {merchant.name?.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-[13px] font-semibold text-[#F5EDD8]">{merchant.name}</h3>
                                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#F5EDD8]/50">
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
                                            className="shrink-0 rounded-xl border border-[#F5EDD8]/20 px-3 py-1.5 text-xs font-semibold text-[#F5EDD8]/70 transition duration-150 active:bg-[#3D2A1A]"
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

function EmptyState({ emoji, title, description }: { emoji: string; title: string; description: string }) {
    return (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
            <span className="text-3xl">{emoji}</span>
            <p className="text-sm font-semibold text-[#F5EDD8]/40">{title}</p>
            <p className="text-xs text-[#F5EDD8]/30">{description}</p>
        </div>
    );
}

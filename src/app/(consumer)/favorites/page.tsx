"use client";

import { useState } from "react";
import Link from "next/link";
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
        <div className="flex flex-col">
            <div className="flex border-b border-secondary">
                {(["produits", "boutiques"] as Tab[]).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={cx(
                            "flex-1 border-b-2 py-3 text-center text-sm font-medium transition duration-100",
                            activeTab === tab
                                ? "border-[var(--ts-ochre)] text-[var(--ts-ochre)]"
                                : "border-transparent text-tertiary",
                        )}
                    >
                        {tab === "produits" ? "Produits" : "Boutiques"}
                    </button>
                ))}
            </div>

            <div className="p-4">
                {activeTab === "produits" && (
                    <div className="space-y-3">
                        {loadingFavs ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-24 animate-pulse rounded-xl bg-secondary" />
                            ))
                        ) : !favorites || favorites.length === 0 ? (
                            <p className="py-12 text-center text-sm text-tertiary">Aucun produit en favoris</p>
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
                                        className="flex gap-3 rounded-xl border border-secondary p-3 transition duration-100 hover:shadow-sm"
                                    >
                                        <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-tertiary">
                                            {product.photo_url ? (
                                                <img src={product.photo_url} alt={product.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-sm font-bold text-quaternary">
                                                    {product.name?.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-1 flex-col justify-between">
                                            <div>
                                                <h3 className="text-sm font-semibold text-primary">{product.name}</h3>
                                                <p className="text-sm font-bold text-primary">{product.price?.toFixed(2)} €</p>
                                                {merchant && <p className="text-xs text-tertiary">{merchant.name}</p>}
                                            </div>
                                            <StockBadge quantity={quantity} />
                                        </div>
                                        <HeartButton
                                            isFavorite
                                            onToggle={() => remove.mutate(fav.product_id)}
                                            ariaLabel={`Retirer ${product.name} des favoris`}
                                        />
                                    </Link>
                                );
                            })
                        )}
                    </div>
                )}

                {activeTab === "boutiques" && (
                    <div className="space-y-3">
                        {loadingFollows ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary" />
                            ))
                        ) : !follows || follows.length === 0 ? (
                            <p className="py-12 text-center text-sm text-tertiary">Aucune boutique suivie</p>
                        ) : (
                            follows.map((f: any) => {
                                const merchant = f.merchants;
                                if (!merchant) return null;
                                return (
                                    <Link
                                        key={f.merchant_id}
                                        href={`/shop/${f.merchant_id}`}
                                        className="flex items-center gap-3 rounded-xl border border-secondary p-3 transition duration-100 hover:shadow-sm"
                                    >
                                        <div className="size-12 shrink-0 overflow-hidden rounded-full bg-tertiary">
                                            {merchant.photo_url ? (
                                                <img src={merchant.photo_url} alt={merchant.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-sm font-bold text-quaternary">
                                                    {merchant.name?.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-sm font-semibold text-primary">{merchant.name}</h3>
                                            <p className="text-xs text-tertiary">{merchant.city}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                unfollow.mutate(f.merchant_id);
                                            }}
                                            className="rounded-lg border border-secondary px-3 py-1.5 text-xs font-medium text-secondary transition duration-100 hover:bg-secondary"
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

"use client";

import Link from "next/link";
import { MarkerPin01 } from "@untitledui/icons";
import { HeartButton } from "./heart-button";
import { StockBadge } from "./stock-badge";
import { cx } from "@/utils/cx";

interface ProductCardProps {
    id: string;
    name: string;
    price: number;
    photo?: string | null;
    merchantName: string;
    distance: number;
    stockQuantity: number;
    salePrice?: number | null;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    className?: string;
}

export function ProductCard({
    id, name, price, photo, merchantName, distance, stockQuantity, salePrice, isFavorite, onToggleFavorite, className,
}: ProductCardProps) {
    return (
        <Link
            href={`/product/${id}`}
            className={cx(
                "group block overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xs transition duration-100 hover:shadow-md",
                className,
            )}
        >
            <div className="relative aspect-square w-full overflow-hidden bg-tertiary">
                {photo ? (
                    <img src={photo} alt={name} className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full items-center justify-center text-xl font-bold text-quaternary">{name.charAt(0)}</div>
                )}
                <div className="absolute right-2 top-2">
                    <HeartButton
                        isFavorite={isFavorite}
                        onToggle={onToggleFavorite}
                        ariaLabel={`${isFavorite ? "Retirer" : "Ajouter"} ${name} des favoris`}
                        className="bg-primary/80 backdrop-blur-sm"
                    />
                </div>
            </div>
            <div className="p-2.5">
                <h3 className="truncate text-sm font-semibold text-primary">{name}</h3>
                <div className="mt-0.5 flex items-center gap-2">
                    {salePrice ? (
                        <>
                            <span className="text-sm font-bold text-[var(--ts-ochre)]">{salePrice.toFixed(2)} €</span>
                            <span className="text-xs text-tertiary line-through">{price.toFixed(2)} €</span>
                        </>
                    ) : (
                        <span className="text-sm font-bold text-primary">{price.toFixed(2)} €</span>
                    )}
                </div>
                <p className="mt-1 truncate text-xs text-tertiary">{merchantName}</p>
                <div className="mt-1 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-xs text-tertiary">
                        <MarkerPin01 className="size-3" aria-hidden="true" />
                        {distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`}
                    </span>
                    <StockBadge quantity={stockQuantity} />
                </div>
            </div>
        </Link>
    );
}

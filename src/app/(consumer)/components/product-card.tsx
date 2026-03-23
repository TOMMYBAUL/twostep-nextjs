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
    const formattedDistance = distance < 1
        ? `${Math.round(distance * 1000)}m`
        : `${distance.toFixed(1)}km`;

    return (
        <Link
            href={`/product/${id}`}
            className={cx(
                "group block overflow-hidden rounded-2xl bg-white shadow-sm transition duration-150 hover:shadow-md",
                className,
            )}
        >
            {/* Image hero — 60% ratio */}
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--ts-cream)]">
                {photo ? (
                    <img
                        src={photo}
                        alt={name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <span className="text-3xl font-bold text-[var(--ts-brown-mid)]/20">
                            {name.charAt(0)}
                        </span>
                    </div>
                )}

                {/* Heart button — top right */}
                <div className="absolute right-2 top-2">
                    <HeartButton
                        isFavorite={isFavorite}
                        onToggle={onToggleFavorite}
                        ariaLabel={`${isFavorite ? "Retirer" : "Ajouter"} ${name} des favoris`}
                        className="bg-white/70 backdrop-blur-sm"
                    />
                </div>

                {/* Stock badge — bottom left overlay */}
                <div className="absolute bottom-2 left-2">
                    <StockBadge
                        quantity={stockQuantity}
                        className="bg-white/80 backdrop-blur-sm shadow-sm"
                    />
                </div>

                {/* Sale tag — top left */}
                {salePrice && (
                    <div className="absolute left-2 top-2 rounded-full bg-[var(--ts-red)] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        -{Math.round(((price - salePrice) / price) * 100)}%
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-3">
                <h3 className="truncate text-[13px] font-semibold text-[var(--ts-brown)]">{name}</h3>

                <div className="mt-1 flex items-baseline gap-1.5">
                    {salePrice ? (
                        <>
                            <span className="text-sm font-bold text-[var(--ts-ochre)]">{salePrice.toFixed(2)} €</span>
                            <span className="text-[11px] text-[var(--ts-brown-mid)]/50 line-through">{price.toFixed(2)} €</span>
                        </>
                    ) : (
                        <span className="text-sm font-bold text-[var(--ts-brown)]">{price.toFixed(2)} €</span>
                    )}
                </div>

                <div className="mt-1.5 flex items-center justify-between">
                    <span className="truncate text-[11px] text-[var(--ts-brown-mid)]/60">{merchantName}</span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-[var(--ts-brown-mid)]/50">
                        <MarkerPin01 className="size-3" aria-hidden="true" />
                        {formattedDistance}
                    </span>
                </div>
            </div>
        </Link>
    );
}

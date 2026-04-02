"use client";

import Link from "next/link";
import { MarkerPin01, Tag01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { generateSlug } from "@/lib/slug";

interface ShopCardProps {
    id: string;
    name: string;
    description?: string | null;
    photo?: string | null;
    category?: string | null;
    address: string;
    distance: number;
    productCount: number;
    promoCount: number;
    className?: string;
}

export function ShopCard({
    id, name, description, photo, category, address, distance, productCount, promoCount, className,
}: ShopCardProps) {
    return (
        <Link
            href={`/shop/${generateSlug(name, id)}`}
            className={cx(
                "group block overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xs transition duration-100 hover:shadow-md",
                className,
            )}
        >
            <div className="relative h-32 w-full overflow-hidden bg-tertiary">
                {photo ? (
                    <img src={photo} alt={name} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
                ) : (
                    <div className="flex h-full items-center justify-center text-2xl font-bold text-quaternary">{name.charAt(0)}</div>
                )}
            </div>
            <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-primary">{name}</h3>
                    {category && (
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary">{category}</span>
                    )}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-tertiary">
                    <MarkerPin01 className="size-3.5" aria-hidden="true" />
                    <span>{distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ts-sage)]">
                        <span className="size-1.5 animate-pulse rounded-full bg-[var(--ts-sage)]" aria-hidden="true" />
                        {productCount} produit{productCount > 1 ? "s" : ""} disponible{productCount > 1 ? "s" : ""}
                    </span>
                    {promoCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--ts-accent)]">
                            <Tag01 className="size-3" aria-hidden="true" />
                            {promoCount} promo{promoCount > 1 ? "s" : ""}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    );
}

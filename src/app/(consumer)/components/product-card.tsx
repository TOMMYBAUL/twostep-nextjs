"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle } from "@untitledui/icons";
import { motion, useInView, useReducedMotion } from "motion/react";
import { HeartButton } from "./heart-button";
import { cx } from "@/utils/cx";
import { generateSlug } from "@/lib/slug";

interface ProductCardProps {
    id: string;
    name: string;
    price: number;
    photo?: string | null;
    category?: string | null;
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
    const safeDistance = distance ?? 0;
    const formattedDistance = safeDistance < 1
        ? `${Math.round(safeDistance * 1000)}m`
        : `${safeDistance.toFixed(1)}km`;

    const isLow = stockQuantity > 0 && stockQuantity <= 3;
    const hasPromo = salePrice != null && salePrice < price;
    const ref = useRef<HTMLAnchorElement>(null);
    const prefersReducedMotion = useReducedMotion();
    const inView = useInView(ref, { once: true, margin: "-40px" });

    return (
        <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.35, ease: "easeOut" }}
        >
        <Link
            ref={ref}
            href={`/product/${generateSlug(name, id)}`}
            aria-label={`${name} — ${merchantName} — ${hasPromo ? salePrice!.toFixed(2) : price.toFixed(2)} €`}
            className={cx(
                "group block overflow-hidden rounded-[10px] transition duration-100 motion-reduce:transform-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                className,
            )}
        >
            {/* Image — 3:4 ratio */}
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[10px] bg-secondary">
                {photo ? (
                    <Image
                        src={photo}
                        alt={name}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="h-full w-full object-cover transition duration-300 motion-reduce:transform-none md:group-hover:scale-[1.03]"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center" aria-hidden="true">
                        <span className="font-[family-name:var(--font-barlow)] text-3xl font-light text-primary/15">
                            {name.charAt(0)}
                        </span>
                    </div>
                )}

                {/* Heart — white circle with shadow, 44px touch target */}
                <div className="absolute right-2 top-2">
                    <HeartButton
                        isFavorite={isFavorite}
                        onToggle={onToggleFavorite}
                        ariaLabel={`${isFavorite ? "Retirer" : "Ajouter"} ${name} des favoris`}
                    />
                </div>

                {/* Promo badge — blue */}
                {hasPromo && (
                    <div className="absolute left-2 top-2 rounded-md bg-brand-solid px-1.5 py-0.5 font-[family-name:var(--font-barlow)] text-[11px] font-semibold text-white">
                        -{Math.round(((price - salePrice!) / price) * 100)}%
                    </div>
                )}

                {/* Low stock badge */}
                {isLow && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-warning-solid px-1.5 py-0.5 font-[family-name:var(--font-inter)] text-[10px] font-medium text-white">
                        <AlertTriangle className="size-2.5" aria-hidden="true" />
                        Plus que {stockQuantity}
                    </div>
                )}
            </div>

            {/* Info — Modèle B: nom, boutique · distance, prix */}
            <div className="px-0.5 pb-1 pt-2.5">
                {/* Product name */}
                <p className="truncate font-[family-name:var(--font-barlow)] text-[13px] font-bold leading-tight text-primary tracking-[-0.2px]">
                    {name}
                </p>

                {/* Merchant · distance */}
                <p className="mt-0.5 truncate font-[family-name:var(--font-inter)] text-[11px] text-tertiary">
                    {merchantName} · {formattedDistance}
                </p>

                {/* Price */}
                <div className="mt-1 flex items-baseline gap-1.5">
                    {hasPromo ? (
                        <>
                            <span className="font-[family-name:var(--font-barlow)] text-[13px] font-extrabold text-primary">
                                {salePrice!.toFixed(2)} €
                            </span>
                            <span className="font-[family-name:var(--font-inter)] text-[11px] text-tertiary line-through">
                                {price.toFixed(2)} €
                            </span>
                        </>
                    ) : (
                        <span className="font-[family-name:var(--font-barlow)] text-[13px] font-extrabold text-primary">
                            {price.toFixed(2)} €
                        </span>
                    )}
                </div>
            </div>
        </Link>
        </motion.div>
    );
}

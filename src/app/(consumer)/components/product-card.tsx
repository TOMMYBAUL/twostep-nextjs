"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { MarkerPin01 } from "@untitledui/icons";
import { motion, useInView } from "motion/react";
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
    id, name, price, photo, category, merchantName, distance, stockQuantity, salePrice, isFavorite, onToggleFavorite, className,
}: ProductCardProps) {
    const formattedDistance = distance < 1
        ? `${Math.round(distance * 1000)}m`
        : `${distance.toFixed(1)}km`;

    const isLow = stockQuantity > 0 && stockQuantity <= 3;
    const isOut = stockQuantity === 0;
    const ref = useRef<HTMLAnchorElement>(null);
    const inView = useInView(ref, { once: true, margin: "-40px" });

    return (
        <motion.div
            style={{ opacity: inView ? 1 : 0, y: inView ? 0 : 16 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
        >
        <Link
            ref={ref}
            href={`/product/${generateSlug(name, id)}`}
            className={cx("group block", className)}
        >
            {/* Photo — square, neutral bg, no border/shadow */}
            <div className="relative aspect-square w-full overflow-hidden bg-[#F8F9FC]">
                {photo ? (
                    <Image
                        src={photo}
                        alt={name}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className={cx(
                            "h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]",
                            isOut && "opacity-50",
                        )}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <span className="text-4xl font-light text-[var(--ts-brown-mid)]/10">
                            {name.charAt(0)}
                        </span>
                    </div>
                )}

                {/* Heart — outline only, no bg circle */}
                <div className="absolute right-2.5 top-2.5">
                    <HeartButton
                        isFavorite={isFavorite}
                        onToggle={onToggleFavorite}
                        ariaLabel={`${isFavorite ? "Retirer" : "Ajouter"} ${name} des favoris`}
                    />
                </div>

                {/* Promo tag — discret, couleurs Two-Step */}
                {salePrice && (
                    <div className="absolute left-2.5 bottom-2.5 rounded-sm bg-[var(--ts-ochre)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                        -{Math.round(((price - salePrice) / price) * 100)}%
                    </div>
                )}
            </div>

            {/* Info — Farfetch hierarchy, light text for dark bg */}
            <div className="mt-3 space-y-0.5">
                {/* Category — small, muted */}
                {category && (
                    <p className="text-[11px] font-light text-[#1A1F36]/35">{category}</p>
                )}

                {/* Merchant — bold */}
                <p className="text-[13px] font-bold text-[#1A1F36]">{merchantName}</p>

                {/* Product name — normal weight, allows wrapping */}
                <p className="text-[13px] leading-snug text-[#1A1F36]/60">{name}</p>

                {/* Price */}
                <div className="flex items-baseline gap-2 pt-0.5">
                    {salePrice ? (
                        <>
                            <span className="text-[13px] text-[#1A1F36]">{salePrice.toFixed(2)} €</span>
                            <span className="text-[11px] text-[#1A1F36]/30 line-through">{price.toFixed(2)} €</span>
                        </>
                    ) : (
                        <span className="text-[13px] text-[#1A1F36]">{price.toFixed(2)} €</span>
                    )}
                </div>

                {/* Distance + stock — subtle footer */}
                <div className="flex items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-[#1A1F36]/30">
                        <MarkerPin01 className="size-2.5" aria-hidden="true" />
                        {formattedDistance}
                    </span>
                    {isOut && (
                        <span className="text-[10px] text-[#1A1F36]/30">Indisponible</span>
                    )}
                    {isLow && (
                        <span className="text-[10px] text-[#4268FF]">Dernières pièces</span>
                    )}
                </div>
            </div>
        </Link>
        </motion.div>
    );
}

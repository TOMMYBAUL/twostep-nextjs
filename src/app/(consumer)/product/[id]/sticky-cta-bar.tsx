"use client";

import { cx } from "@/utils/cx";

interface StickyCtaBarProps {
    price: number;
    salePrice: number | null;
    quantity: number;
    hasSizes: boolean;
    selectedSize: string | null;
    intentSent: boolean;
    intentLoading: boolean;
    onIntent: () => void;
    onOpenSizeSheet: () => void;
}

export function StickyCtaBar({
    price, salePrice, quantity, hasSizes, selectedSize,
    intentSent, intentLoading, onIntent, onOpenSizeSheet,
}: StickyCtaBarProps) {
    const displayPrice = salePrice ?? price;
    const needsSize = hasSizes && !selectedSize;
    const isUnavailable = quantity === 0;

    return (
        <div
            className="fixed inset-x-0 bottom-0 z-40 border-t border-secondary bg-primary md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <div className="mx-auto flex max-w-lg items-center justify-between gap-4 px-5 py-3">
                {/* Price */}
                <div className="flex items-baseline gap-1.5">
                    <span className="text-[15px] font-bold text-primary">
                        {displayPrice.toFixed(2)} €
                    </span>
                    {salePrice != null && salePrice < price && (
                        <span className="text-[12px] text-tertiary line-through">
                            {price.toFixed(2)} €
                        </span>
                    )}
                </div>

                {/* CTA button */}
                {isUnavailable ? (
                    <button
                        type="button"
                        disabled
                        className="rounded-[12px] bg-disabled px-6 py-3 text-[13px] font-bold text-disabled"
                    >
                        Indisponible
                    </button>
                ) : intentSent ? (
                    <button
                        type="button"
                        disabled
                        className="rounded-[12px] bg-secondary px-6 py-3 text-[13px] font-semibold text-tertiary"
                    >
                        ✓ Prévenu
                    </button>
                ) : needsSize ? (
                    <button
                        type="button"
                        onClick={onOpenSizeSheet}
                        className="rounded-[12px] bg-brand-solid px-6 py-3 text-[13px] font-bold text-white transition active:opacity-90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                        Choisir une taille
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onIntent}
                        disabled={intentLoading}
                        className="flex items-center gap-2 rounded-[12px] bg-brand-solid px-6 py-3 text-[13px] font-bold text-white transition active:opacity-90 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                        {intentLoading ? (
                            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        ) : (
                            "J'arrive !"
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}

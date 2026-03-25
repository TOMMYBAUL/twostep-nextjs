"use client";

import { useState } from "react";
import Link from "next/link";
import { MarkerPin01, Tag01, SearchLg } from "@untitledui/icons";
import { generateSlug } from "@/lib/slug";

interface Merchant {
    merchant_id: string;
    merchant_name: string;
    merchant_description?: string | null;
    merchant_photo?: string | null;
    merchant_address: string;
    distance_km: number;
    product_count: number;
    promo_count: number;
}

interface SidePanelProps {
    merchants: Merchant[];
    isLoading: boolean;
}

export function SidePanel({ merchants, isLoading }: SidePanelProps) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            className="absolute left-0 top-0 z-10 flex h-full"
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
            onTouchStart={() => setExpanded(true)}
        >
            {/* Panel */}
            <div
                className={
                    "h-full overflow-y-auto overflow-x-hidden bg-primary/95 shadow-xl backdrop-blur-sm transition-all duration-300 ease-out " +
                    (expanded ? "w-72" : "w-12")
                }
            >
                {isLoading ? (
                    <div className="flex flex-col gap-2 p-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className={expanded ? "h-20 animate-pulse rounded-xl bg-secondary" : "mx-auto size-8 animate-pulse rounded-full bg-secondary"}
                            />
                        ))}
                    </div>
                ) : merchants.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                        {expanded ? (
                            <div className="flex flex-col items-center gap-2 px-4 text-center">
                                <SearchLg className="size-6 text-quaternary" aria-hidden="true" />
                                <p className="text-xs font-semibold text-secondary">Aucune boutique trouvée</p>
                                <p className="text-[11px] text-tertiary">Essaie d&apos;élargir ta zone ou de changer de catégorie</p>
                            </div>
                        ) : (
                            <div className="h-8 w-0.5 rounded-full bg-quaternary" />
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-1 p-1.5">
                        {merchants.map((m) =>
                            expanded ? (
                                <ExpandedCard key={m.merchant_id} merchant={m} />
                            ) : (
                                <CollapsedPill key={m.merchant_id} merchant={m} />
                            ),
                        )}
                    </div>
                )}
            </div>

            {/* Invisible grab zone to make it easier to trigger on mobile */}
            {!expanded && (
                <div
                    className="h-full w-3 cursor-pointer"
                    onTouchStart={() => setExpanded(true)}
                />
            )}

            {/* Backdrop to close on tap outside (mobile) */}
            {expanded && (
                <div
                    className="h-full flex-1"
                    onClick={() => setExpanded(false)}
                    onTouchStart={() => setExpanded(false)}
                />
            )}
        </div>
    );
}

function CollapsedPill({ merchant }: { merchant: Merchant }) {
    return (
        <Link
            href={`/shop/${generateSlug(merchant.merchant_name, merchant.merchant_id)}`}
            className="flex size-9 items-center justify-center rounded-full bg-[var(--ts-ochre)] text-xs font-bold text-white shadow-sm transition duration-100 hover:scale-110"
            title={merchant.merchant_name}
        >
            {merchant.merchant_name.charAt(0).toUpperCase()}
        </Link>
    );
}

function ExpandedCard({ merchant }: { merchant: Merchant }) {
    return (
        <Link
            href={`/shop/${generateSlug(merchant.merchant_name, merchant.merchant_id)}`}
            className="group flex gap-2.5 rounded-xl p-2 transition duration-100 hover:bg-secondary"
        >
            {/* Avatar */}
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ts-ochre)] text-sm font-bold text-white">
                {merchant.merchant_photo ? (
                    <img src={merchant.merchant_photo} alt="" className="size-full rounded-full object-cover" />
                ) : (
                    merchant.merchant_name.charAt(0).toUpperCase()
                )}
            </div>
            {/* Info */}
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-primary">{merchant.merchant_name}</p>
                <p className="flex items-center gap-1 text-[11px] text-tertiary">
                    <MarkerPin01 className="size-3 shrink-0" aria-hidden="true" />
                    {merchant.distance_km < 1
                        ? `${Math.round(merchant.distance_km * 1000)}m`
                        : `${merchant.distance_km.toFixed(1)}km`}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[var(--ts-sage)]">
                        {merchant.product_count} produit{merchant.product_count > 1 ? "s" : ""}
                    </span>
                    {merchant.promo_count > 0 && (
                        <span className="flex items-center gap-0.5 text-[11px] text-[var(--ts-ochre)]">
                            <Tag01 className="size-2.5" aria-hidden="true" />
                            {merchant.promo_count}
                        </span>
                    )}
                </div>
            </div>
        </Link>
    );
}

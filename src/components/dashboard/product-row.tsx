"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ChevronDown } from "@untitledui/icons";

import { StockBadge } from "./stock-badge";
import { SizeDisplay } from "./size-display";
import type { SizeEntry } from "@/lib/types";

interface ProductRowProps {
    id: string;
    name: string;
    category: string | null;
    price: number | null;
    stockQuantity: number;
    photoUrl: string | null;
    staggerIndex: number;
    stockControls?: React.ReactNode;
    sizes?: SizeEntry[] | null;
    hasPOS?: boolean;
    expandedContent?: React.ReactNode;
}

const CATEGORY_COLORS: Record<string, string> = {
    mode: "bg-brand-secondary",
    chaussures: "bg-secondary",
    bijoux: "bg-warning-secondary",
    beaute: "bg-error-secondary",
    cosmetique: "bg-error-secondary",
    sport: "bg-success-secondary",
    deco: "bg-success-secondary",
    epicerie: "bg-warning-secondary",
    tech: "bg-secondary",
};

const CATEGORY_EMOJIS: Record<string, string> = {
    mode: "👗",
    chaussures: "👟",
    bijoux: "💎",
    beaute: "💄",
    cosmetique: "✨",
    sport: "⚽",
    deco: "🏠",
    epicerie: "🧺",
    tech: "📱",
};

export function ProductRow({ id, name, category, price, stockQuantity, photoUrl, staggerIndex, stockControls, sizes, hasPOS = true, expandedContent }: ProductRowProps) {
    const [expanded, setExpanded] = useState(false);
    const canExpand = !!expandedContent;

    const bg = CATEGORY_COLORS[category ?? ""] ?? "bg-secondary";
    const emoji = CATEGORY_EMOJIS[category ?? ""] ?? "📦";

    const thumbnail = photoUrl ? (
        <Image src={photoUrl} alt={name} width={42} height={42} className="size-[42px] shrink-0 rounded-[10px] object-cover" />
    ) : (
        <div className={`flex size-[42px] shrink-0 items-center justify-center rounded-[10px] text-xl ${bg}`}>
            {emoji}
        </div>
    );

    const info = (
        <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-primary">{name}</p>
            {category && <p className="text-xs text-quaternary">{category}</p>}
            {sizes && sizes.length > 0 && !expanded && <SizeDisplay sizes={sizes} hasPOS={hasPOS} />}
        </div>
    );

    const price_ = (
        <p className="w-20 text-right text-sm font-semibold text-primary">
            {price != null ? `${price.toFixed(2)} €` : "—"}
        </p>
    );

    const chevron = canExpand ? (
        <button
            type="button"
            aria-label={expanded ? "Réduire les variantes" : "Voir les variantes"}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-tertiary hover:bg-secondary_hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
        >
            <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
    ) : null;

    const staggerClass = `stagger-${Math.min(staggerIndex + 5, 10)}`;

    // stockControls or expandable variant — use div wrapper so interactive
    // children aren't nested inside <a>.
    if (stockControls || canExpand) {
        return (
            <div className={`animate-fade-up ${staggerClass} overflow-hidden rounded-xl bg-primary`}>
                <div className="flex items-center gap-4 px-4 py-3.5">
                    <Link href={`/dashboard/products/${id}/edit`} className="flex min-w-0 flex-1 items-center gap-4 no-underline">
                        {thumbnail}
                        {info}
                        {price_}
                    </Link>
                    {stockControls}
                    {!stockControls && canExpand && <StockBadge quantity={stockQuantity} hasPOS={hasPOS} />}
                    {chevron}
                </div>
                {canExpand && expanded && (
                    <div className="border-t border-secondary bg-secondary_subtle px-4 py-3">
                        {expandedContent}
                    </div>
                )}
            </div>
        );
    }

    return (
        <Link
            href={`/dashboard/products/${id}/edit`}
            className={`product-row-ts animate-fade-up ${staggerClass} flex items-center gap-4 rounded-xl bg-primary px-4 py-3.5 no-underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none`}
        >
            {thumbnail}
            {info}
            {price_}

            <div className="w-24 text-center">
                <StockBadge quantity={stockQuantity} />
            </div>

            <span className="row-arrow text-quaternary opacity-0 transition-opacity" aria-hidden="true">→</span>
        </Link>
    );
}

import Link from "next/link";
import { StockBadge } from "./stock-badge";

interface ProductRowProps {
    id: string;
    name: string;
    category: string | null;
    price: number | null;
    stockQuantity: number;
    photoUrl: string | null;
    staggerIndex: number;
}

const CATEGORY_COLORS: Record<string, string> = {
    mode: "bg-purple-50",
    chaussures: "bg-blue-50",
    bijoux: "bg-amber-50",
    beaute: "bg-pink-50",
    cosmetique: "bg-pink-50",
    sport: "bg-green-50",
    deco: "bg-emerald-50",
    epicerie: "bg-amber-50",
    tech: "bg-slate-50",
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

export function ProductRow({ id, name, category, price, stockQuantity, photoUrl, staggerIndex }: ProductRowProps) {
    const bg = CATEGORY_COLORS[category ?? ""] ?? "bg-gray-100";
    const emoji = CATEGORY_EMOJIS[category ?? ""] ?? "📦";

    return (
        <Link
            href={`/dashboard/products/${id}/edit`}
            className={`product-row-ts animate-fade-up stagger-${Math.min(staggerIndex + 5, 10)} flex items-center gap-4 rounded-xl bg-white px-4 py-3.5 no-underline`}
        >
            {/* Thumbnail */}
            {photoUrl ? (
                <img src={photoUrl} alt={name} className="size-[42px] shrink-0 rounded-[10px] object-cover" />
            ) : (
                <div className={`flex size-[42px] shrink-0 items-center justify-center rounded-[10px] text-xl ${bg}`}>
                    {emoji}
                </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
                {category && <p className="text-xs text-gray-400">{category}</p>}
            </div>

            {/* Price */}
            <p className="w-20 text-right text-sm font-semibold text-gray-900">
                {price != null ? `${price.toFixed(2)} €` : "—"}
            </p>

            {/* Stock */}
            <div className="w-24 text-center">
                <StockBadge quantity={stockQuantity} />
            </div>

            {/* Arrow */}
            <span className="row-arrow text-gray-300 opacity-0 transition-opacity">→</span>
        </Link>
    );
}

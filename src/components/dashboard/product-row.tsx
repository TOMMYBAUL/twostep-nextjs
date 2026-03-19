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
    Alimentation: "bg-amber-50",
    Cosmétique: "bg-pink-50",
    Hygiène: "bg-blue-50",
    Textile: "bg-purple-50",
    Décoration: "bg-green-50",
    Autre: "bg-gray-100",
};

const CATEGORY_EMOJIS: Record<string, string> = {
    Alimentation: "🥖",
    Cosmétique: "✨",
    Hygiène: "🧴",
    Textile: "👕",
    Décoration: "🏠",
    Autre: "📦",
};

export function ProductRow({ id, name, category, price, stockQuantity, photoUrl, staggerIndex }: ProductRowProps) {
    const bg = CATEGORY_COLORS[category ?? "Autre"] ?? "bg-gray-100";
    const emoji = CATEGORY_EMOJIS[category ?? "Autre"] ?? "📦";

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

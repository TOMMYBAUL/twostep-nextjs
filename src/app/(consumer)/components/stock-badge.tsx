import { cx } from "@/utils/cx";

interface StockBadgeProps {
    quantity: number;
    size?: "sm" | "md";
    className?: string;
}

export function StockBadge({ quantity, size = "sm", className }: StockBadgeProps) {
    const isLow = quantity > 0 && quantity <= 3;
    const available = quantity > 0;

    return (
        <span
            className={cx(
                "inline-flex items-center gap-1 rounded-full font-semibold",
                size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
                available
                    ? isLow
                        ? "bg-[var(--ts-orange)]/10 text-[var(--ts-orange)]"
                        : "bg-[var(--ts-sage)]/15 text-[var(--ts-sage)]"
                    : "bg-gray-100 text-gray-400",
                className,
            )}
        >
            <span
                className={cx(
                    "size-1.5 rounded-full",
                    available
                        ? isLow
                            ? "bg-[var(--ts-orange)]"
                            : "bg-[var(--ts-sage)]"
                        : "bg-gray-300",
                )}
                aria-hidden="true"
            />
            {available ? (isLow ? "Stock faible" : "En stock") : "Épuisé"}
        </span>
    );
}

import { cx } from "@/utils/cx";

interface StockBadgeProps {
    quantity: number;
    className?: string;
}

export function StockBadge({ quantity, className }: StockBadgeProps) {
    const available = quantity > 0;

    return (
        <span
            className={cx(
                "inline-flex items-center gap-1.5 text-xs font-medium",
                available ? "text-[var(--ts-sage)]" : "text-tertiary",
                className,
            )}
        >
            <span
                className={cx(
                    "size-1.5 rounded-full",
                    available ? "bg-[var(--ts-sage)] animate-pulse" : "bg-tertiary",
                )}
                aria-hidden="true"
            />
            {available ? "Disponible" : "Indisponible"}
        </span>
    );
}

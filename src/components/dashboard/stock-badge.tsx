import { cx } from "@/utils/cx";

interface StockBadgeProps {
    quantity: number;
}

export function StockBadge({ quantity }: StockBadgeProps) {
    const level = quantity === 0 ? "out" : quantity <= 10 ? "low" : "ok";

    const styles = {
        ok: "text-[#5a9474]",
        low: "text-[#b8860b]",
        out: "text-red-700",
    };

    const bgStyles = {
        ok: "bg-[var(--ts-sage-light)]",
        low: "bg-amber-50",
        out: "bg-red-50",
    };

    const dotStyles = {
        ok: "bg-[var(--ts-sage)]",
        low: "bg-amber-500",
        out: "bg-red-500",
    };

    return (
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", bgStyles[level], styles[level])}>
            <span className={cx("size-1.5 rounded-full", dotStyles[level])} />
            {quantity === 0 ? "Rupture" : quantity}
        </span>
    );
}

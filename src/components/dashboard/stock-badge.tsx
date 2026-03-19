import { cx } from "@/utils/cx";

interface StockBadgeProps {
    quantity: number;
}

export function StockBadge({ quantity }: StockBadgeProps) {
    const level = quantity === 0 ? "out" : quantity <= 10 ? "low" : "ok";

    const styles = {
        ok: "bg-green-50 text-green-800",
        low: "bg-amber-50 text-amber-800",
        out: "bg-red-50 text-red-800",
    };

    const dotStyles = {
        ok: "bg-green-500",
        low: "bg-amber-500",
        out: "bg-red-500",
    };

    return (
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", styles[level])}>
            <span className={cx("size-1.5 rounded-full", dotStyles[level])} />
            {quantity === 0 ? "Rupture" : quantity}
        </span>
    );
}

import { cx } from "@/utils/cx";

interface StockBadgeProps {
    quantity: number;
}

export function StockBadge({ quantity }: StockBadgeProps) {
    const level = quantity === 0 ? "out" : quantity <= 10 ? "low" : "ok";

    const styles = {
        ok: "text-success-primary",
        low: "text-warning-primary",
        out: "text-error-primary",
    };

    const bgStyles = {
        ok: "bg-success-secondary",
        low: "bg-warning-secondary",
        out: "bg-error-secondary",
    };

    const dotStyles = {
        ok: "bg-success-solid",
        low: "bg-warning-solid",
        out: "bg-error-solid",
    };

    return (
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", bgStyles[level], styles[level])}>
            <span className={cx("size-1.5 rounded-full", dotStyles[level])} />
            {quantity === 0 ? "Rupture" : quantity}
        </span>
    );
}

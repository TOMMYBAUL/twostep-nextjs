import { cx } from "@/utils/cx";
import { deriveStockBadgeView, type ConfidencePayload } from "@/lib/stock/stock-badge-view";

interface StockBadgeProps {
    quantity: number;
    hasPOS?: boolean;
    size?: "sm" | "md";
    className?: string;
    /**
     * Verdict M5 émis par la route (flag `CONSUMER_M5_CONFIDENCE=1`).
     * `undefined` = flag OFF → rendu legacy inchangé. `null` = « pas pu
     * vérifier » → état prudent (jamais « Stock vérifié » sans preuve).
     */
    confidence?: ConfidencePayload | null;
}

export function StockBadge({ quantity, hasPOS = true, size = "sm", className, confidence }: StockBadgeProps) {
    // ── Mode M5 (P0-4) : la route a fourni un verdict confiance/fraîcheur ──
    if (confidence !== undefined) {
        const view = deriveStockBadgeView({ confidence, quantity });
        const tone =
            view.state === "available"
                ? { pill: "bg-[var(--ts-sage)]/15 text-[var(--ts-sage)]", dot: "bg-[var(--ts-sage)]" }
                : view.state === "probable"
                  ? { pill: "bg-[var(--ts-orange)]/10 text-[var(--ts-orange)]", dot: "bg-[var(--ts-orange)]" }
                  : { pill: "bg-gray-100 text-gray-400", dot: "bg-gray-300" };
        return (
            <span
                className={cx(
                    "inline-flex items-center gap-1 rounded-full font-semibold",
                    size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
                    tone.pill,
                    className,
                )}
                title={view.freshnessLabel ?? undefined}
            >
                <span className={cx("size-1.5 rounded-full", tone.dot)} aria-hidden="true" />
                {view.label}
            </span>
        );
    }

    // ── Mode legacy (flag OFF) : rendu historique, inchangé ──
    const available = quantity > 0;

    if (!hasPOS) {
        return (
            <span
                className={cx(
                    "inline-flex items-center gap-1 rounded-full font-semibold",
                    size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
                    available
                        ? "bg-[var(--ts-sage)]/15 text-[var(--ts-sage)]"
                        : "bg-gray-100 text-gray-400",
                    className,
                )}
            >
                <span
                    className={cx("size-1.5 rounded-full", available ? "bg-[var(--ts-sage)]" : "bg-gray-300")}
                    aria-hidden="true"
                />
                {available ? "Disponible en boutique" : "Indisponible"}
            </span>
        );
    }

    const isLow = quantity > 0 && quantity <= 3;

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
            {available ? (isLow ? "Stock faible" : "Stock vérifié") : "Épuisé"}
        </span>
    );
}

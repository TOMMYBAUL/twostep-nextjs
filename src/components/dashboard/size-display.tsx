// NOTE: Dashboard-only component — consumer never shows unavailable sizes
import type { SizeEntry } from "@/lib/types";

interface SizeDisplayProps {
    sizes: SizeEntry[] | null;
    hasPOS: boolean;
}

/**
 * Displays available sizes for a product.
 * - POS: shows sizes with quantities (38(3) · 39(2))
 * - Non-POS: two lines — "Disponible: 38 · 39" and "Épuisé: 40"
 * - Only shows sizes that have existed (never-stocked sizes are excluded)
 */
export function SizeDisplay({ sizes, hasPOS }: SizeDisplayProps) {
    if (!sizes || sizes.length === 0) return null;

    if (hasPOS) {
        const inStock = sizes.filter((s) => s.quantity > 0);
        if (inStock.length === 0) return null;
        return (
            <div className="flex flex-wrap gap-1">
                {inStock.map((s) => (
                    <span key={s.size} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary">
                        {s.size} <span className="text-quaternary">({s.quantity})</span>
                    </span>
                ))}
            </div>
        );
    }

    // Non-POS: two lines
    const available = sizes.filter((s) => s.quantity > 0);
    const unavailable = sizes.filter((s) => s.quantity === 0);

    return (
        <div className="flex flex-col gap-0.5">
            {available.length > 0 && (
                <p className="text-[10px] text-success-primary">
                    <span className="font-semibold">Dispo :</span>{" "}
                    {available.map((s) => s.size).join(" · ")}
                </p>
            )}
            {unavailable.length > 0 && (
                <p className="text-[10px] text-error-primary">
                    <span className="font-semibold">Épuisé :</span>{" "}
                    {unavailable.map((s) => s.size).join(" · ")}
                </p>
            )}
        </div>
    );
}

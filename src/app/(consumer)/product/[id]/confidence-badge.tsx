"use client";

import { cx } from "@/utils/cx";

/**
 * Badge d'état de confiance du stock — le visage consommateur du principe
 * « jamais de compteur brut » : Disponible / Stock probable / Épuisé,
 * avec la fraîcheur (« vu il y a 12 min ») quand elle existe.
 *
 * La donnée vient du champ `confidence` de l'API produit. En son absence
 * (cache ancien), on retombe sur un état honnête dérivé de la quantité :
 * jamais « Disponible » sans donnée de confiance.
 */

export type StockConfidenceDto = {
    state: "available" | "probable" | "out";
    label: string;
    freshnessLabel: string | null;
};

const STYLES: Record<StockConfidenceDto["state"], { chip: string; dot: string }> = {
    available: { chip: "bg-success-secondary text-success-primary", dot: "bg-success-solid" },
    probable: { chip: "bg-warning-secondary text-warning-primary", dot: "bg-warning-solid" },
    out: { chip: "bg-secondary text-tertiary", dot: "bg-quaternary" },
};

const FALLBACK_LABELS: Record<StockConfidenceDto["state"], string> = {
    available: "Disponible",
    probable: "Stock probable",
    out: "Épuisé",
};

export function ConfidenceBadge({
    confidence,
    quantity,
    className,
}: {
    confidence?: StockConfidenceDto | null;
    quantity: number;
    className?: string;
}) {
    const state: StockConfidenceDto["state"] =
        confidence?.state ?? (quantity <= 0 ? "out" : "probable");
    const label = confidence?.label ?? FALLBACK_LABELS[state];
    const freshness = confidence?.freshnessLabel ?? null;
    const s = STYLES[state];

    return (
        <span
            className={cx(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11px] font-medium",
                s.chip,
                className,
            )}
        >
            <span className={cx("size-1.5 rounded-full", s.dot)} aria-hidden="true" />
            {label}
            {freshness && state !== "out" && (
                <span className="font-normal opacity-80">&middot; {freshness}</span>
            )}
        </span>
    );
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import { cx } from "@/utils/cx";

interface SizeFilterPanelProps {
    show: boolean;
    availableSizes: { clothing: string[]; shoe: number[] } | undefined;
    sizeFilter: string | null;
    shoeSizeFilter: number | null;
    hasActiveSizeFilter: boolean;
    onSizeFilterChange: (size: string | null) => void;
    onShoeSizeFilterChange: (size: number | null) => void;
    onClose: () => void;
    onReset: () => void;
}

export function SizeFilterPanel({
    show,
    availableSizes,
    sizeFilter,
    shoeSizeFilter,
    hasActiveSizeFilter,
    onSizeFilterChange,
    onShoeSizeFilterChange,
    onClose,
    onReset,
}: SizeFilterPanelProps) {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                >
                    <div className="mt-3 rounded-xl border-[0.5px] border-secondary bg-secondary p-3">
                        {/* Clothing size */}
                        {(availableSizes?.clothing?.length ?? 0) > 0 && (
                            <>
                                <p className="mb-2 text-[11px] font-medium text-tertiary">Taille vêtements</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {availableSizes!.clothing.map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            aria-pressed={sizeFilter === s}
                                            onClick={() => { onSizeFilterChange(sizeFilter === s ? null : s); onClose(); }}
                                            className={cx(
                                                "min-h-[44px] rounded-lg px-3 py-2.5 text-[11px] font-medium transition duration-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                                                sizeFilter === s
                                                    ? "bg-brand-solid text-white"
                                                    : "bg-white text-quaternary",
                                            )}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Shoe size */}
                        {(availableSizes?.shoe?.length ?? 0) > 0 && (
                            <>
                                <p className={cx("mb-2 text-[11px] font-medium text-tertiary", (availableSizes?.clothing?.length ?? 0) > 0 && "mt-3")}>Pointure</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {availableSizes!.shoe.map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            aria-pressed={shoeSizeFilter === s}
                                            onClick={() => { onShoeSizeFilterChange(shoeSizeFilter === s ? null : s); onClose(); }}
                                            className={cx(
                                                "min-h-[44px] rounded-lg px-2.5 py-2.5 text-[11px] font-medium transition duration-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                                                shoeSizeFilter === s
                                                    ? "bg-brand-solid text-white"
                                                    : "bg-white text-quaternary",
                                            )}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}

                        {(availableSizes?.clothing?.length ?? 0) === 0 && (availableSizes?.shoe?.length ?? 0) === 0 && (
                            <p className="text-[11px] text-tertiary">Aucune taille renseignée pour le moment.</p>
                        )}

                        {/* Reset */}
                        {hasActiveSizeFilter && (
                            <button
                                type="button"
                                onClick={onReset}
                                className="mt-2.5 min-h-[44px] text-[11px] font-medium text-brand-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none rounded"
                            >
                                Réinitialiser les filtres
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

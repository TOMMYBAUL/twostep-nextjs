"use client";

import { Heart } from "@untitledui/icons";
import { motion, useReducedMotion } from "motion/react";
import { cx } from "@/utils/cx";

interface HeartButtonProps {
    isFavorite: boolean;
    onToggle: () => void;
    ariaLabel: string;
    className?: string;
}

export function HeartButton({ isFavorite, onToggle, ariaLabel, className }: HeartButtonProps) {
    const prefersReducedMotion = useReducedMotion();

    return (
        <motion.button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
            }}
            whileTap={{ scale: prefersReducedMotion ? 1 : 1.18 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className={cx(
                "flex size-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition duration-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                isFavorite
                    ? "text-error-primary"
                    : "text-primary/40 hover:text-primary/60",
                className,
            )}
            aria-label={ariaLabel}
            aria-pressed={isFavorite}
        >
            <Heart
                className="size-4"
                fill={isFavorite ? "currentColor" : "none"}
                aria-hidden="true"
            />
        </motion.button>
    );
}

"use client";

import { Heart } from "@untitledui/icons";
import { motion } from "motion/react";
import { cx } from "@/utils/cx";

interface HeartButtonProps {
    isFavorite: boolean;
    onToggle: () => void;
    ariaLabel: string;
    className?: string;
}

export function HeartButton({ isFavorite, onToggle, ariaLabel, className }: HeartButtonProps) {
    return (
        <motion.button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
            }}
            whileTap={{ scale: 1.3 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className={cx(
                "flex min-h-11 min-w-11 items-center justify-center rounded-full p-1.5 transition duration-100",
                isFavorite
                    ? "text-[var(--ts-red)]"
                    : "text-tertiary hover:text-secondary",
                className,
            )}
            aria-label={ariaLabel}
            aria-pressed={isFavorite}
        >
            <Heart
                className="size-5"
                fill={isFavorite ? "currentColor" : "none"}
                aria-hidden="true"
            />
        </motion.button>
    );
}

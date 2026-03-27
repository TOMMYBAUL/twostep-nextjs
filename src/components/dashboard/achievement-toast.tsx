"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import { useCelebration } from "@/providers/celebration-provider";

const CONFETTI_COLORS = ["#D4A574", "#E07A5F", "#81B29A", "#FFD700"];

export function AchievementToast() {
    const { current, dismiss } = useCelebration();
    const show = current !== null && current.mode === "toast";

    useEffect(() => {
        if (!show) return;

        confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.1 },
            colors: CONFETTI_COLORS,
            disableForReducedMotion: true,
        });

        const timer = setTimeout(dismiss, 5000);
        return () => clearTimeout(timer);
    }, [show, dismiss]);

    return (
        <AnimatePresence>
            {show && current && (
                <motion.div
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="fixed left-1/2 top-4 z-[100] -translate-x-1/2"
                >
                    <div
                        className="flex items-center gap-3.5 rounded-[20px] bg-white px-5 py-4"
                        style={{
                            border: `2px solid ${current.color}`,
                            boxShadow: `0 4px 20px rgba(44,26,14,0.12)`,
                            minWidth: 300,
                            maxWidth: 380,
                        }}
                    >
                        <div
                            className="flex size-12 shrink-0 items-center justify-center rounded-full"
                            style={{
                                background: current.gradient,
                                boxShadow: `0 2px 8px ${current.color}4D`,
                            }}
                        >
                            <span className="text-[22px]">{current.emoji}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: current.color }}>
                                {current.gamifiedLabel}
                            </p>
                            <p className="text-sm font-bold text-[#2C1A0E]">{current.label}</p>
                            <p className="text-[11px] text-[#8B7355] mt-0.5">{current.subtitle}</p>
                        </div>
                        <button
                            onClick={dismiss}
                            className="shrink-0 text-lg text-[#8B7355]/30 hover:text-[#8B7355] transition"
                        >
                            ✕
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

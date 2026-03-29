"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import { useCelebration } from "@/providers/celebration-provider";
import { AchievementIconRenderer } from "./achievement-icon-renderer";

const CONFETTI_COLORS = ["#D4A574", "#E07A5F", "#81B29A", "#FFD700"];

function heavyConfetti() {
    const end = Date.now() + 3000;
    const frame = () => {
        confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: CONFETTI_COLORS,
            disableForReducedMotion: true,
        });
        confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: CONFETTI_COLORS,
            disableForReducedMotion: true,
        });
        if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
}

export function AchievementModal() {
    const { current, dismiss } = useCelebration();
    const router = useRouter();
    const show = current !== null && current.mode === "modal";

    useEffect(() => {
        if (!show) return;
        heavyConfetti();
    }, [show]);

    return (
        <AnimatePresence>
            {show && current && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center"
                    style={{ background: "rgba(44,26,14,0.5)" }}
                    onClick={dismiss}
                >
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: "spring", damping: 20, stiffness: 300 }}
                        className="rounded-3xl bg-white px-8 py-10 text-center"
                        style={{ maxWidth: 360, boxShadow: "0 8px 40px rgba(44,26,14,0.2)" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="mx-auto flex items-center justify-center rounded-full"
                            style={{
                                width: 88,
                                height: 88,
                                background: current.gradient,
                                boxShadow: `0 4px 16px ${current.color}66`,
                            }}
                        >
                            <AchievementIconRenderer icon={current.icon} size={40} />
                        </div>

                        <p className="mt-5 text-xs font-extrabold uppercase tracking-widest" style={{ color: current.color }}>
                            {current.gamifiedLabel}
                        </p>
                        <p className="mt-2 text-[22px] font-extrabold text-[#2C1A0E]">{current.label}</p>
                        <p className="mt-2 text-sm text-[#8B7355] leading-relaxed">{current.subtitle}</p>

                        <button
                            onClick={() => { dismiss(); router.push("/dashboard/achievements"); }}
                            className="mt-6 w-full rounded-xl py-3 text-sm font-bold text-white transition hover:opacity-90"
                            style={{ background: "linear-gradient(135deg, #D4A574, #C4956A)" }}
                        >
                            Voir mes trophées
                        </button>

                        <button
                            onClick={dismiss}
                            className="mt-3 text-xs text-[#8B7355] opacity-70 hover:opacity-100 transition"
                        >
                            Continuer
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

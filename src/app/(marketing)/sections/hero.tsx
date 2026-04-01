"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { SPRING, slideUp } from "@/lib/motion";

export function Hero() {
    const { scrollY } = useScroll();
    const bgY = useTransform(scrollY, [0, 600], [0, 180]);

    return (
        <section className="relative overflow-hidden flex items-center justify-center min-h-svh pt-20 md:pt-24 pb-16">
            {/* Background layer — dark + parallax */}
            <motion.div
                className="absolute inset-0 -z-10"
                style={{ y: bgY, backgroundColor: "#1A1F36", scale: 1.15 }}
            />

            {/* Radial glow overlay */}
            <div
                className="absolute inset-0 -z-10 pointer-events-none"
                style={{
                    background:
                        "radial-gradient(circle at 50% 60%, rgba(66,104,255,0.12) 0%, transparent 60%)",
                }}
            />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center text-center px-5">
                {/* Title */}
                <motion.h1
                    {...slideUp(0.2)}
                    className="font-black text-white leading-tight tracking-[-0.8px] max-w-[640px]"
                    style={{ fontSize: "clamp(28px, 5vw, 42px)" }}
                >
                    Le stock de ton quartier,{" "}
                    <br className="hidden sm:block" />à deux pas de chez toi
                </motion.h1>

                {/* Subtitle */}
                <motion.p
                    {...slideUp(0.3)}
                    className="mt-4 text-[14px] leading-relaxed max-w-[420px]"
                    style={{ color: "rgba(255,255,255,0.60)" }}
                >
                    Découvre ce qui est disponible maintenant dans les boutiques autour
                    de toi. Stock réel, pas du catalogue.
                </motion.p>

                {/* CTA */}
                <motion.div {...slideUp(0.4)} className="mt-8">
                    <Link
                        href="/discover"
                        className="inline-block bg-[#4268FF] text-white font-bold text-[14px] rounded-xl px-7 py-3 transition duration-100 ease-linear hover:bg-[#3558e8] active:scale-95"
                    >
                        Découvrir les boutiques →
                    </Link>
                </motion.div>

                {/* Small reassurance text */}
                <motion.p
                    {...slideUp(0.5)}
                    className="mt-3 text-[11px]"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                >
                    Gratuit · Pas besoin de compte pour explorer
                </motion.p>
            </div>
        </section>
    );
}

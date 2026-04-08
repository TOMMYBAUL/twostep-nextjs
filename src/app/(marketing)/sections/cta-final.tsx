"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import Link from "next/link";

export function CTAFinal() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-15%" });

    return (
        <motion.section
            ref={ref}
            className="relative overflow-hidden bg-[#1A1F36] px-6 py-16 text-center md:px-12 md:py-20"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ type: "spring", stiffness: 150, damping: 30 }}
        >
            {/* Subtle blue radial glow */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(ellipse at 50% 40%, rgba(66,104,255,0.12) 0%, transparent 70%)",
                }}
            />

            <h2 className="relative mx-auto max-w-md text-[22px] font-[900] leading-tight tracking-tight text-white md:text-[28px]">
                Prêt à découvrir{" "}
                <br />
                ton quartier ?
            </h2>
            <p className="relative mt-3 text-[13px] text-white/80">
                Gratuit, sans compte, en 2 secondes.
            </p>
            <div className="relative mt-6">
                <Link
                    href="/discover"
                    className="inline-block rounded-xl bg-brand-solid px-7 py-3 text-[14px] font-[800] text-white transition-colors duration-200 hover:bg-brand-solid_hover"
                >
                    Découvrir →
                </Link>
            </div>
        </motion.section>
    );
}

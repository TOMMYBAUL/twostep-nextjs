"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { slideUp } from "@/lib/motion";

export function Hero() {
    const { scrollY } = useScroll();
    const bgY = useTransform(scrollY, [0, 600], [0, 120]);
    const bgScale = useTransform(scrollY, [0, 600], [1, 1.08]);

    return (
        <section className="relative flex min-h-svh items-end overflow-hidden pb-20 pt-20 md:items-center md:pb-24 md:pt-24">
            {/* Background photo with parallax */}
            <motion.div
                className="absolute inset-0 -z-20"
                style={{ y: bgY, scale: bgScale }}
            >
                <Image
                    src="/images/hero-street.webp"
                    alt="Rue commerçante à Toulouse"
                    fill
                    priority
                    sizes="100vw"
                    className="object-cover"
                />
            </motion.div>

            {/* Dark gradient overlay */}
            <div
                className="absolute inset-0 -z-10 pointer-events-none"
                style={{
                    background: "linear-gradient(to top, rgba(10,12,20,0.75) 0%, rgba(10,12,20,0.4) 40%, rgba(10,12,20,0.2) 70%, rgba(10,12,20,0.35) 100%)",
                }}
            />

            {/* Subtle blue glow */}
            <div
                className="absolute inset-0 -z-10 pointer-events-none"
                style={{
                    background: "radial-gradient(ellipse at 30% 70%, rgba(66,104,255,0.15) 0%, transparent 50%)",
                }}
            />

            {/* Content */}
            <div className="relative z-10 mx-auto w-full max-w-[1100px] px-6 md:px-12">
                <div className="max-w-[560px]">
                    {/* Badge */}
                    <motion.div {...slideUp(0.1)}>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-sm">
                            <span className="inline-block size-1.5 rounded-full bg-brand-solid animate-pulse" />
                            Disponible à Toulouse
                        </span>
                    </motion.div>

                    {/* Title */}
                    <motion.h1
                        {...slideUp(0.2)}
                        className="mt-5 font-black leading-[1.05] tracking-[-0.03em] text-white"
                        style={{ fontSize: "clamp(32px, 5.5vw, 56px)" }}
                    >
                        Le stock de ton quartier,{" "}
                        <span className="text-brand-secondary">à deux pas</span>{" "}
                        de chez toi
                    </motion.h1>

                    {/* Subtitle */}
                    <motion.p
                        {...slideUp(0.3)}
                        className="mt-5 text-[15px] leading-relaxed text-white/65 md:text-[17px]"
                        style={{ maxWidth: 440 }}
                    >
                        Découvre ce qui est vraiment disponible dans les boutiques autour de toi.
                        Stock réel, mis à jour en temps réel.
                    </motion.p>

                    {/* CTAs */}
                    <motion.div {...slideUp(0.4)} className="mt-8 flex flex-wrap gap-3">
                        <Link
                            href="/discover"
                            className="inline-flex items-center rounded-xl bg-brand-solid px-6 py-3.5 text-[14px] font-bold text-white transition duration-100 ease-linear hover:bg-brand-solid_hover active:scale-[0.97]"
                        >
                            Découvrir les boutiques →
                        </Link>
                        <Link
                            href="/onboarding"
                            className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-[14px] font-semibold text-white backdrop-blur-sm transition duration-100 ease-linear hover:bg-white/20 active:scale-[0.97]"
                        >
                            Je suis commerçant
                        </Link>
                    </motion.div>

                    {/* Reassurance */}
                    <motion.p
                        {...slideUp(0.5)}
                        className="mt-4 text-[12px] text-white/35"
                    >
                        Gratuit · Pas besoin de compte pour explorer
                    </motion.p>
                </div>
            </div>

            {/* Scroll indicator */}
            <motion.div
                className="absolute bottom-6 left-1/2 -translate-x-1/2"
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
                <div className="flex flex-col items-center gap-1">
                    <div className="h-8 w-[1px] bg-gradient-to-b from-transparent to-white/30" />
                    <div className="size-1 rounded-full bg-white/40" />
                </div>
            </motion.div>
        </section>
    );
}

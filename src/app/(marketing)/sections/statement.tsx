"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { slideUp } from "@/lib/motion";
import { Counter } from "../utils";

const stats = [
    { id: "boutiques", value: 50, display: null, suffix: "+", label: "Boutiques partenaires" },
    { id: "produits", value: 5000, display: null, suffix: "+", label: "Produits disponibles" },
    { id: "ville", value: null, display: "Toulouse", suffix: null, label: "Et bientôt d'autres villes" },
];

export function Statement() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-15%" });

    return (
        <section
            ref={ref}
            className="py-16 px-6 md:py-20 md:px-12"
            style={{ background: "#1A1F36" }}
        >
            <div className="max-w-[1100px] mx-auto">
                {/* Desktop: 3 columns — Mobile: 2-col top + 1-col bottom */}
                <div className="hidden md:grid md:grid-cols-3 gap-8">
                    {stats.map((stat, i) => {
                        const su = slideUp(i * 0.15);
                        return (
                            <motion.div
                                key={stat.id}
                                initial={su.initial}
                                animate={inView ? su.animate : su.initial}
                                transition={su.transition}
                                className="text-center"
                            >
                                <div
                                    className="font-black tracking-tight text-white"
                                    style={{ fontSize: 28, fontWeight: 900 }}
                                >
                                    {stat.value !== null ? (
                                        <>
                                            <Counter to={stat.value} inView={inView} />
                                            {stat.suffix}
                                        </>
                                    ) : (
                                        <span style={{ color: "#4268FF" }}>{stat.display}</span>
                                    )}
                                </div>
                                <div
                                    className="mt-2 text-white/50"
                                    style={{ fontSize: 12 }}
                                >
                                    {stat.label}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Mobile layout */}
                <div className="md:hidden space-y-3">
                    {/* First 2 in a 2-col grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {stats.slice(0, 2).map((stat, i) => {
                            const su = slideUp(i * 0.15);
                            return (
                                <motion.div
                                    key={stat.id}
                                    initial={su.initial}
                                    animate={inView ? su.animate : su.initial}
                                    transition={su.transition}
                                    className="text-center rounded-xl p-5"
                                    style={{ background: "rgba(255,255,255,0.05)" }}
                                >
                                    <div
                                        className="font-black tracking-tight text-white"
                                        style={{ fontSize: 28, fontWeight: 900 }}
                                    >
                                        <Counter to={stat.value!} inView={inView} />
                                        {stat.suffix}
                                    </div>
                                    <div
                                        className="mt-2 text-white/50"
                                        style={{ fontSize: 12 }}
                                    >
                                        {stat.label}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Toulouse — full width */}
                    {(() => {
                        const su = slideUp(0.3);
                        return (
                            <motion.div
                                initial={su.initial}
                                animate={inView ? su.animate : su.initial}
                                transition={su.transition}
                                className="text-center rounded-xl p-5 w-full"
                                style={{ background: "rgba(255,255,255,0.05)" }}
                            >
                                <div
                                    className="font-black tracking-tight"
                                    style={{ fontSize: 28, fontWeight: 900, color: "#4268FF" }}
                                >
                                    Toulouse
                                </div>
                                <div
                                    className="mt-2 text-white/50"
                                    style={{ fontSize: 12 }}
                                >
                                    Et bientôt d&apos;autres villes
                                </div>
                            </motion.div>
                        );
                    })()}
                </div>
            </div>
        </section>
    );
}

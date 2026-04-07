"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { slideUp } from "@/lib/motion";
import { Counter } from "../utils";

const highlights = [
    {
        id: "reach",
        value: 200000,
        prefix: "+",
        display: null,
        label: "Commerces déjà compatibles",
        sub: "Square · Shopify · Lightspeed · Zettle · Fastmag · Clictill (bientôt)",
        color: "#FFFFFF",
    },
    {
        id: "saisie",
        value: 0,
        prefix: null,
        display: "0 saisie",
        label: "Stock rempli automatiquement",
        sub: "On lit votre caisse. Vos produits apparaissent seuls.",
        color: "#4268FF",
    },
    {
        id: "temps",
        value: null,
        prefix: null,
        display: "< 2 min",
        label: "Pour tout connecter",
        sub: "Branchez votre caisse, on s'occupe du reste",
        color: "#FFFFFF",
    },
];

export function Statement() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-15%" });

    return (
        <section
            ref={ref}
            className="px-6 py-16 md:px-12 md:py-20"
            style={{ background: "#1A1F36" }}
        >
            <div className="mx-auto max-w-[1100px]">
                {/* Desktop */}
                <div className="hidden md:grid md:grid-cols-3 md:gap-8">
                    {highlights.map((item, i) => {
                        const su = slideUp(i * 0.15);
                        return (
                            <motion.div
                                key={item.id}
                                initial={su.initial}
                                animate={inView ? su.animate : su.initial}
                                transition={su.transition}
                                className="text-center"
                            >
                                <div
                                    className="font-black tracking-tight"
                                    style={{ fontSize: 32, fontWeight: 900, color: item.color }}
                                >
                                    {item.display ? (
                                        item.display
                                    ) : (
                                        <>
                                            {item.prefix}
                                            <Counter to={item.value!} inView={inView} />
                                        </>
                                    )}
                                </div>
                                <div className="mt-2 text-[13px] font-semibold text-white/80">
                                    {item.label}
                                </div>
                                <div className="mt-1.5 text-[11px] text-white/40">
                                    {item.sub}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Mobile */}
                <div className="space-y-3 md:hidden">
                    {highlights.map((item, i) => {
                        const su = slideUp(i * 0.15);
                        return (
                            <motion.div
                                key={item.id}
                                initial={su.initial}
                                animate={inView ? su.animate : su.initial}
                                transition={su.transition}
                                className="rounded-xl p-5 text-center"
                                style={{ background: "rgba(255,255,255,0.05)" }}
                            >
                                <div
                                    className="font-black tracking-tight"
                                    style={{ fontSize: 28, fontWeight: 900, color: item.color }}
                                >
                                    {item.display ? (
                                        item.display
                                    ) : (
                                        <>
                                            {item.prefix}
                                            <Counter to={item.value!} inView={inView} />
                                        </>
                                    )}
                                </div>
                                <div className="mt-2 text-[12px] font-semibold text-white/80">
                                    {item.label}
                                </div>
                                <div className="mt-1 text-[10px] text-white/40">
                                    {item.sub}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

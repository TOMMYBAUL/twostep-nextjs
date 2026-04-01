"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import Link from "next/link";
import { slideUp } from "@/lib/motion";

const bullets = [
    "Compatible Square, Shopify, Lightspeed, SumUp, Zettle",
    "Stock synchronisé automatiquement toutes les 15 min",
    "Dashboard avec métriques et conseils personnalisés",
];

export function Contact() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-15%" });

    const label = slideUp(0);
    const title = slideUp(0.1);
    const subtitle = slideUp(0.2);
    const bulletsAnim = slideUp(0.3);
    const cta = slideUp(0.4);

    return (
        <section
            id="marchands"
            ref={ref}
            className="py-16 px-6 md:py-20 md:px-12"
            style={{ background: "#FFFFFF" }}
        >
            <div className="max-w-[1100px] mx-auto">
                {/* Label */}
                <motion.div
                    initial={label.initial}
                    animate={inView ? label.animate : label.initial}
                    transition={label.transition}
                    className="font-bold uppercase mb-3"
                    style={{
                        fontSize: 11,
                        color: "#4268FF",
                        letterSpacing: "0.14em",
                    }}
                >
                    Vous êtes commerçant ?
                </motion.div>

                {/* Title */}
                <motion.h2
                    initial={title.initial}
                    animate={inView ? title.animate : title.initial}
                    transition={title.transition}
                    className="tracking-tight mb-4"
                    style={{
                        fontSize: "clamp(22px, 3vw, 28px)",
                        fontWeight: 900,
                        color: "#1A1A1A",
                        lineHeight: 1.1,
                    }}
                >
                    Rendez votre stock visible
                </motion.h2>

                {/* Subtitle */}
                <motion.p
                    initial={subtitle.initial}
                    animate={inView ? subtitle.animate : subtitle.initial}
                    transition={subtitle.transition}
                    className="mb-6 text-gray-500 max-w-[480px]"
                    style={{ fontSize: 13, lineHeight: 1.6 }}
                >
                    Connectez votre caisse en 2 minutes. Vos produits apparaissent automatiquement auprès des clients de votre quartier. Gratuit pour commencer.
                </motion.p>

                {/* Bullets */}
                <motion.ul
                    initial={bulletsAnim.initial}
                    animate={inView ? bulletsAnim.animate : bulletsAnim.initial}
                    transition={bulletsAnim.transition}
                    className="flex flex-col gap-2 mb-8"
                >
                    {bullets.map((text) => (
                        <li key={text} className="flex items-center gap-2">
                            <span
                                className="shrink-0 rounded-full"
                                style={{
                                    width: 6,
                                    height: 6,
                                    background: "#4268FF",
                                }}
                            />
                            <span className="text-gray-600" style={{ fontSize: 12 }}>
                                {text}
                            </span>
                        </li>
                    ))}
                </motion.ul>

                {/* CTA */}
                <motion.div
                    initial={cta.initial}
                    animate={inView ? cta.animate : cta.initial}
                    transition={cta.transition}
                >
                    <Link
                        href="/onboarding"
                        className="inline-block rounded-xl px-6 py-3 font-bold text-white"
                        style={{
                            background: "#1A1A1A",
                            fontSize: 14,
                        }}
                    >
                        Inscrire ma boutique →
                    </Link>
                </motion.div>
            </div>
        </section>
    );
}

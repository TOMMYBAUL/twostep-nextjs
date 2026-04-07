"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { slideUp } from "@/lib/motion";

const bullets = [
    "Compatible Square, Shopify, Lightspeed, Zettle — Fastmag et Clictill bientôt",
    "Stock synchronisé automatiquement en temps réel",
    "Enrichissement IA : photos, catégories, tailles",
    "Diffusion Google Merchant, Google Maps, app Two-Step",
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
    const schemaAnim = slideUp(0.3);

    return (
        <section
            id="marchands"
            ref={ref}
            className="px-6 py-16 md:px-12 md:py-20"
            style={{ background: "#FFFFFF" }}
        >
            <div className="mx-auto max-w-[1100px]">
                <div className="flex flex-col gap-10 md:flex-row md:items-center md:gap-16">
                    {/* Left — Text */}
                    <div className="flex-1">
                        {/* Label */}
                        <motion.div
                            initial={label.initial}
                            animate={inView ? label.animate : label.initial}
                            transition={label.transition}
                            className="mb-3 font-bold uppercase"
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
                            className="mb-4 tracking-tight"
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
                            className="mb-6 max-w-[480px] text-gray-500"
                            style={{ fontSize: 13, lineHeight: 1.6 }}
                        >
                            Connectez votre caisse en 2 minutes. Vos produits apparaissent
                            automatiquement auprès des clients de votre quartier et sur
                            Google. Gratuit pour commencer.
                        </motion.p>

                        {/* Bullets */}
                        <motion.ul
                            initial={bulletsAnim.initial}
                            animate={inView ? bulletsAnim.animate : bulletsAnim.initial}
                            transition={bulletsAnim.transition}
                            className="mb-8 flex flex-col gap-2.5"
                        >
                            {bullets.map((text) => (
                                <li key={text} className="flex items-start gap-2.5">
                                    <span
                                        className="mt-1.5 shrink-0 rounded-full"
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
                                className="inline-block rounded-xl px-6 py-3 font-bold text-white transition duration-100 ease-linear hover:opacity-90 active:scale-[0.97]"
                                style={{
                                    background: "#1A1A1A",
                                    fontSize: 14,
                                }}
                            >
                                Inscrire ma boutique →
                            </Link>
                        </motion.div>
                    </div>

                    {/* Right — Schema image */}
                    <motion.div
                        initial={schemaAnim.initial}
                        animate={inView ? schemaAnim.animate : schemaAnim.initial}
                        transition={schemaAnim.transition}
                        className="flex-1"
                    >
                        <div className="overflow-hidden rounded-2xl border border-[#E8ECF4] bg-[#F8F9FC] p-4 shadow-sm">
                            <Image
                                src="/images/how-it-works/schema-compressed.jpg"
                                alt="Schéma Two-Step : Fournisseurs → Caisses POS → Two-Step → Diffusion (App, Google Merchant, Google Maps)"
                                width={800}
                                height={450}
                                className="w-full rounded-xl"
                                sizes="(max-width: 768px) 100vw, 550px"
                            />
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

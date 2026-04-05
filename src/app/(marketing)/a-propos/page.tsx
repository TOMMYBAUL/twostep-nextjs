"use client";

import Link from "next/link";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { slideUp, stagger, SPRING } from "@/lib/motion";
import { LenisProvider } from "../components/lenis-provider";
import { Nav } from "../sections/nav";
import { Footer } from "../sections/footer";

const storyBlocks = [
    {
        label: "Le constat",
        text: "95% du stock en boutique est invisible en ligne. Les clients cherchent sur internet, ne trouvent pas, et ach\u00e8tent ailleurs. Pendant ce temps, le produit exact qu\u2019ils veulent est \u00e0 5 minutes \u00e0 pied.",
    },
    {
        label: "La solution",
        text: "Two-Step connecte les caisses enregistreuses des commer\u00e7ants \u00e0 une plateforme qui rend leur stock visible \u2014 sur l\u2019app, sur Google, sur Maps. Automatiquement, en temps r\u00e9el, sans effort.",
    },
    {
        label: "La mission",
        text: "Faire du commerce local la premi\u00e8re option. Quand un produit existe dans une boutique \u00e0 c\u00f4t\u00e9 de chez toi, tu devrais le savoir \u2014 avant m\u00eame de chercher en ligne.",
    },
];

const CheckCircleIcon = () => (
    <svg className="size-6 text-[#4268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const ChartIcon = () => (
    <svg className="size-6 text-[#4268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l4-8 4 4 4-6" />
    </svg>
);

const MapPinIcon = () => (
    <svg className="size-6 text-[#4268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const values = [
    {
        icon: <CheckCircleIcon />,
        title: "Z\u00e9ro friction",
        description:
            "Pas de saisie, pas de formation, pas d\u2019abonnement pour commencer. On se branche sur votre caisse existante.",
    },
    {
        icon: <ChartIcon />,
        title: "Donn\u00e9es propres",
        description:
            "On ne se contente pas de relayer. On enrichit, on cat\u00e9gorise, on optimise vos donn\u00e9es pour qu\u2019elles convertissent.",
    },
    {
        icon: <MapPinIcon />,
        title: "Local d\u2019abord",
        description:
            "Lanc\u00e9 \u00e0 Toulouse. On construit avec les commer\u00e7ants, pas dans un bureau \u00e0 Paris.",
    },
];

export default function AProposPage() {
    const storyRef = useRef<HTMLDivElement>(null);
    const storyInView = useInView(storyRef, { once: true, margin: "-10%" });

    const valuesRef = useRef<HTMLDivElement>(null);
    const valuesInView = useInView(valuesRef, { once: true, margin: "-10%" });

    const toulouseRef = useRef<HTMLDivElement>(null);
    const toulouseInView = useInView(toulouseRef, { once: true, margin: "-10%" });

    const ctaRef = useRef<HTMLDivElement>(null);
    const ctaInView = useInView(ctaRef, { once: true, margin: "-10%" });

    return (
        <LenisProvider>
            <Nav />
            <main id="a-propos">
                {/* ── Hero ── */}
                <section className="relative flex min-h-[70svh] items-center justify-center overflow-hidden bg-white px-6 pt-24 pb-16 md:px-12 md:pt-32 md:pb-24">
                    {/* Subtle background gradient */}
                    <div
                        className="pointer-events-none absolute inset-0 -z-10"
                        style={{
                            background:
                                "radial-gradient(ellipse at 50% 0%, rgba(66,104,255,0.06) 0%, transparent 60%)",
                        }}
                    />

                    <div className="mx-auto max-w-[800px] text-center">
                        <motion.p
                            {...slideUp(0.05)}
                            className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]"
                        >
                            &Agrave; PROPOS
                        </motion.p>
                        <motion.h1
                            {...slideUp(0.15)}
                            className="font-black leading-[1.1] tracking-[-0.03em] text-[#1A1F36]"
                            style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
                        >
                            Pourquoi Two-Step existe
                        </motion.h1>
                        <motion.p
                            {...slideUp(0.25)}
                            className="mx-auto mt-5 max-w-[520px] text-[15px] leading-relaxed text-[#6B7280] md:text-[17px]"
                        >
                            Le commerce local a un probl&egrave;me de visibilit&eacute;. On le
                            r&eacute;sout.
                        </motion.p>
                    </div>
                </section>

                {/* ── Story ── */}
                <section
                    ref={storyRef}
                    className="bg-[#FAFAFA] px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[720px] space-y-12">
                        {storyBlocks.map((block, i) => {
                            const su = slideUp(stagger(i, 0.1));
                            return (
                                <motion.div
                                    key={block.label}
                                    initial={su.initial}
                                    animate={storyInView ? su.animate : su.initial}
                                    transition={su.transition}
                                >
                                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]">
                                        {block.label}
                                    </p>
                                    <p className="m-0 text-[16px] leading-relaxed text-[#374151] md:text-[18px]">
                                        {block.text}
                                    </p>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>

                {/* ── Values ── */}
                <section
                    ref={valuesRef}
                    className="bg-white px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[1100px]">
                        <motion.h2
                            initial={{ opacity: 0, y: 32 }}
                            animate={valuesInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="mb-10 text-center text-[22px] font-[900] tracking-tight text-[#1A1F36] md:text-[32px]"
                        >
                            Nos valeurs
                        </motion.h2>

                        <div className="grid gap-8 md:grid-cols-3 md:gap-12">
                            {values.map((val, i) => {
                                const su = slideUp(stagger(i, 0.1));
                                return (
                                    <motion.div
                                        key={val.title}
                                        initial={su.initial}
                                        animate={valuesInView ? su.animate : su.initial}
                                        transition={su.transition}
                                        className="rounded-2xl bg-[#FAFAFA] p-8"
                                    >
                                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4268FF]/10">
                                            {val.icon}
                                        </div>
                                        <h3 className="mb-2 text-[17px] font-bold tracking-tight text-[#1A1F36]">
                                            {val.title}
                                        </h3>
                                        <p className="m-0 text-[14px] leading-relaxed text-[#6B7280]">
                                            {val.description}
                                        </p>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* ── Toulouse ── */}
                <section
                    ref={toulouseRef}
                    className="bg-white px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[600px] text-center">
                        <motion.p
                            initial={{ opacity: 0, y: 24 }}
                            animate={toulouseInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]"
                        >
                            TOULOUSE
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 32 }}
                            animate={toulouseInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.1 }}
                            className="text-[22px] font-[900] tracking-tight text-[#1A1F36] md:text-[32px]"
                        >
                            Construit avec les commer&ccedil;ants, pas pour eux
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 24 }}
                            animate={toulouseInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.2 }}
                            className="mx-auto mt-4 max-w-[480px] text-[15px] leading-relaxed text-[#6B7280] md:text-[17px]"
                        >
                            Two-Step est n&eacute; &agrave; Toulouse. On travaille main dans la
                            main avec les boutiques du quartier pour construire l&rsquo;outil
                            dont elles ont vraiment besoin.
                        </motion.p>
                    </div>
                </section>

                {/* ── CTA ── */}
                <motion.section
                    ref={ctaRef}
                    className="relative overflow-hidden bg-[#1A1F36] px-6 py-16 text-center md:px-12 md:py-20"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={ctaInView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ type: "spring", stiffness: 150, damping: 30 }}
                >
                    {/* Subtle blue radial glow */}
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background:
                                "radial-gradient(ellipse at 50% 50%, rgba(66,104,255,0.12) 0%, transparent 60%)",
                        }}
                    />

                    <h2 className="relative mx-auto max-w-md text-[22px] font-[900] leading-tight tracking-tight text-white md:text-[28px]">
                        Envie de faire partie de l&rsquo;aventure ?
                    </h2>
                    <p className="relative mt-3 text-[13px] text-white/80">
                        Rejoignez les commer&ccedil;ants qui rendent leur stock visible.
                    </p>
                    <div className="relative mt-6">
                        <Link
                            href="/onboarding"
                            className="inline-block rounded-xl bg-white px-7 py-3 text-[14px] font-[800] text-[#4268FF] transition-colors duration-200 hover:bg-white/90"
                        >
                            Rejoindre l&rsquo;aventure &rarr;
                        </Link>
                    </div>
                </motion.section>
            </main>
            <Footer />
        </LenisProvider>
    );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { slideUp, stagger, SPRING } from "@/lib/motion";
import { LenisProvider } from "../components/lenis-provider";
import { Nav } from "../sections/nav";
import { Footer } from "../sections/footer";

/* ── SVG Icons ── */

function CheckCircleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}

function ChartIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l4-8 4 4 4-6" />
        </svg>
    );
}

function MapPinIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    );
}

function HeartIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
    );
}

function CodeIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
    );
}

/* ── Data ── */

const values = [
    {
        icon: CheckCircleIcon,
        title: "Z\u00e9ro friction",
        description:
            "Pas de saisie, pas de formation, pas d\u2019abonnement pour commencer. On se branche sur votre caisse existante et tout fonctionne.",
    },
    {
        icon: ChartIcon,
        title: "Donn\u00e9es propres",
        description:
            "On ne se contente pas de relayer. On enrichit, on cat\u00e9gorise, on optimise vos donn\u00e9es pour qu\u2019elles convertissent.",
    },
    {
        icon: MapPinIcon,
        title: "Local d\u2019abord",
        description:
            "Lanc\u00e9 \u00e0 Toulouse. On construit avec les commer\u00e7ants, pas dans un bureau \u00e0 Paris. Chaque fonctionnalit\u00e9 vient du terrain.",
    },
];

const bigStats = [
    { value: "6", label: "POS int\u00e9gr\u00e9s" },
    { value: "2 412", label: "commerces identifi\u00e9s \u00e0 Toulouse" },
    { value: "< 2 min", label: "de setup" },
];

/* ── Page ── */

export default function AProposPage() {
    const heroRef = useRef<HTMLElement>(null);
    const heroInView = useInView(heroRef, { once: true, margin: "-10%" });

    const storyRef = useRef<HTMLDivElement>(null);
    const storyInView = useInView(storyRef, { once: true, margin: "-10%" });

    const statsRef = useRef<HTMLDivElement>(null);
    const statsInView = useInView(statsRef, { once: true, margin: "-10%" });

    const valuesRef = useRef<HTMLDivElement>(null);
    const valuesInView = useInView(valuesRef, { once: true, margin: "-10%" });

    const toulouseRef = useRef<HTMLDivElement>(null);
    const toulouseInView = useInView(toulouseRef, { once: true, margin: "-10%" });

    const teamRef = useRef<HTMLDivElement>(null);
    const teamInView = useInView(teamRef, { once: true, margin: "-10%" });

    return (
        <LenisProvider>
            <Nav />
            <main id="a-propos" className="bg-white">
                {/* ── Hero ── */}
                <section
                    ref={heroRef}
                    className="px-6 pt-28 pb-10 text-center md:px-12 md:pt-36 md:pb-14"
                >
                    <motion.div
                        {...slideUp(0)}
                        animate={heroInView ? slideUp(0).animate : slideUp(0).initial}
                    >
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4268FF]/10 px-3.5 py-1 text-[12px] font-semibold text-[#4268FF]">
                            &Agrave; propos
                        </span>
                    </motion.div>
                    <motion.h1
                        {...slideUp(0.05)}
                        animate={heroInView ? slideUp(0.05).animate : slideUp(0.05).initial}
                        className="mt-5 text-[32px] font-black leading-tight tracking-tight text-[#1A1F36] md:text-[48px]"
                    >
                        Pourquoi<br />
                        <span className="text-[#4268FF]">Two-Step existe.</span>
                    </motion.h1>
                    <motion.p
                        {...slideUp(0.1)}
                        animate={heroInView ? slideUp(0.1).animate : slideUp(0.1).initial}
                        className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-[#1A1F36]/60 md:text-[17px]"
                    >
                        Le produit que vous cherchez est souvent &agrave; 5 minutes &agrave; pied.
                        Mais personne ne le sait. On change &ccedil;a.
                    </motion.p>
                </section>

                {/* ── The Story — But/Therefore ── */}
                <section
                    ref={storyRef}
                    className="bg-[#FAFAFA] px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[1100px]">
                        {/* Block 1: Le constat */}
                        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
                            <motion.div
                                initial={{ opacity: 0, x: -40 }}
                                animate={storyInView ? { opacity: 1, x: 0 } : {}}
                                transition={{ ...SPRING, delay: 0.1 }}
                            >
                                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]">
                                    LE CONSTAT
                                </p>
                                <h2 className="mb-4 text-[22px] font-black leading-tight tracking-tight text-[#1A1F36] md:text-[28px]">
                                    95% du stock en boutique est invisible en ligne.
                                </h2>
                                <p className="text-[15px] leading-relaxed text-[#6B7280] md:text-[16px]">
                                    Les clients cherchent sur internet, ne trouvent pas, et
                                    ach&egrave;tent ailleurs. Pendant ce temps, le produit exact
                                    qu&rsquo;ils veulent attend sur une &eacute;tag&egrave;re
                                    &agrave; c&ocirc;t&eacute; de chez eux.
                                </p>
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, x: 40 }}
                                animate={storyInView ? { opacity: 1, x: 0 } : {}}
                                transition={{ ...SPRING, delay: 0.2 }}
                                className="overflow-hidden rounded-2xl border border-[#E5E7EB] shadow-sm"
                            >
                                <Image
                                    src="/images/how-it-works/caroucel 3.png"
                                    alt="Boutique ferm\u00e9e et invisible en ligne"
                                    width={600}
                                    height={400}
                                    className="h-[260px] w-full object-cover md:h-[320px]"
                                />
                            </motion.div>
                        </div>

                        {/* Connector */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={storyInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.3 }}
                            className="my-12 flex justify-center md:my-16"
                        >
                            <span className="rounded-full bg-[#4268FF]/10 px-5 py-2 text-[13px] font-bold text-[#4268FF]">
                                MAIS les boutiques ont exactement ce que les gens cherchent
                            </span>
                        </motion.div>

                        {/* Block 2: La solution */}
                        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
                            <motion.div
                                initial={{ opacity: 0, x: -40 }}
                                animate={storyInView ? { opacity: 1, x: 0 } : {}}
                                transition={{ ...SPRING, delay: 0.4 }}
                                className="order-2 overflow-hidden rounded-2xl border border-[#4268FF]/20 shadow-[0_4px_24px_rgba(66,104,255,0.1)] md:order-1"
                            >
                                <Image
                                    src="/images/how-it-works/caroucel 6.png"
                                    alt="Boutique pleine de clients"
                                    width={600}
                                    height={400}
                                    className="h-[260px] w-full object-cover md:h-[320px]"
                                />
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, x: 40 }}
                                animate={storyInView ? { opacity: 1, x: 0 } : {}}
                                transition={{ ...SPRING, delay: 0.5 }}
                                className="order-1 md:order-2"
                            >
                                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]">
                                    DONC
                                </p>
                                <h2 className="mb-4 text-[22px] font-black leading-tight tracking-tight text-[#1A1F36] md:text-[28px]">
                                    On a cr&eacute;&eacute; Two-Step pour connecter les deux.
                                </h2>
                                <p className="text-[15px] leading-relaxed text-[#6B7280] md:text-[16px]">
                                    Two-Step se branche sur la caisse du commer&ccedil;ant et rend
                                    son stock visible &mdash; sur l&rsquo;app, sur Google, sur
                                    Maps. Automatiquement, en temps r&eacute;el, sans effort.
                                    Faire du commerce local la premi&egrave;re option.
                                </p>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* ── By the Numbers ── */}
                <section
                    ref={statsRef}
                    className="bg-white px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[900px]">
                        <motion.p
                            initial={{ opacity: 0, y: 32 }}
                            animate={statsInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]"
                        >
                            EN CHIFFRES
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 32 }}
                            animate={statsInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.05 }}
                            className="mb-12 text-center text-[24px] font-black tracking-tight text-[#1A1F36] md:text-[32px]"
                        >
                            L&agrave; o&ugrave; on en est
                        </motion.h2>

                        <div className="grid gap-8 md:grid-cols-3">
                            {bigStats.map((stat, i) => {
                                const su = slideUp(stagger(i, 0.1));
                                return (
                                    <motion.div
                                        key={stat.label}
                                        initial={su.initial}
                                        animate={statsInView ? su.animate : su.initial}
                                        transition={su.transition}
                                        className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] p-8 text-center"
                                    >
                                        <p className="text-[40px] font-black tracking-tight text-[#4268FF] md:text-[48px]">
                                            {stat.value}
                                        </p>
                                        <p className="mt-2 text-[15px] font-medium text-[#6B7280]">
                                            {stat.label}
                                        </p>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* ── Values ── */}
                <section
                    ref={valuesRef}
                    className="bg-[#FAFAFA] px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[1100px]">
                        <motion.p
                            initial={{ opacity: 0, y: 32 }}
                            animate={valuesInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]"
                        >
                            NOS VALEURS
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 32 }}
                            animate={valuesInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.05 }}
                            className="mb-12 text-center text-[24px] font-black tracking-tight text-[#1A1F36] md:text-[32px]"
                        >
                            Ce qui nous guide
                        </motion.h2>

                        <div className="grid gap-8 md:grid-cols-3 md:gap-10">
                            {values.map((val, i) => {
                                const su = slideUp(stagger(i, 0.1));
                                return (
                                    <motion.div
                                        key={val.title}
                                        initial={su.initial}
                                        animate={valuesInView ? su.animate : su.initial}
                                        transition={su.transition}
                                        className="rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
                                    >
                                        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4268FF]/10">
                                            <val.icon className="size-6 text-[#4268FF]" />
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

                {/* ── Toulouse Section ── */}
                <section
                    ref={toulouseRef}
                    className="relative overflow-hidden px-6 py-16 md:px-12 md:py-24"
                >
                    {/* Background image with overlay */}
                    <div className="absolute inset-0 -z-10">
                        <Image
                            src="/images/how-it-works/caroucel.png"
                            alt="Rue commer\u00e7ante de Toulouse"
                            fill
                            className="object-cover"
                        />
                        <div className="absolute inset-0 bg-[#1A1F36]/80" />
                    </div>

                    <div className="mx-auto max-w-[600px] text-center">
                        <motion.p
                            initial={{ opacity: 0, y: 24 }}
                            animate={toulouseInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]"
                        >
                            TOULOUSE
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 32 }}
                            animate={toulouseInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.1 }}
                            className="text-[22px] font-black tracking-tight text-white md:text-[32px]"
                        >
                            Construit avec les commer&ccedil;ants, pas pour eux
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 24 }}
                            animate={toulouseInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.2 }}
                            className="mx-auto mt-4 max-w-[480px] text-[15px] leading-relaxed text-white/70 md:text-[17px]"
                        >
                            Two-Step est n&eacute; &agrave; Toulouse. On travaille main dans la
                            main avec les boutiques du quartier pour construire l&rsquo;outil
                            dont elles ont vraiment besoin. Chaque fonctionnalit&eacute; vient
                            d&rsquo;un vrai probl&egrave;me, observ&eacute; sur le terrain.
                        </motion.p>
                    </div>
                </section>

                {/* ── Team ── */}
                <section
                    ref={teamRef}
                    className="bg-white px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[600px]">
                        <motion.div
                            initial={{ opacity: 0, y: 32 }}
                            animate={teamInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] p-8 md:p-10"
                        >
                            <div className="mb-5 flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4268FF]/10">
                                    <CodeIcon className="size-6 text-[#4268FF]" />
                                </div>
                                <div>
                                    <h3 className="text-[17px] font-bold text-[#1A1F36]">
                                        Thomas
                                    </h3>
                                    <p className="text-[13px] text-[#6B7280]">
                                        Fondateur
                                    </p>
                                </div>
                            </div>
                            <p className="text-[15px] leading-relaxed text-[#374151]">
                                Kin&eacute;sith&eacute;rapeute de formation,
                                d&eacute;veloppeur par passion. J&rsquo;ai cr&eacute;&eacute;
                                Two-Step parce que je voyais chaque jour des boutiques
                                incroyables rester invisibles en ligne. Le commerce local
                                m&eacute;rite mieux qu&rsquo;un rideau ferm&eacute; sur internet.
                            </p>
                            <div className="mt-5 flex items-center gap-2">
                                <HeartIcon className="size-4 text-[#4268FF]" />
                                <span className="text-[13px] font-medium text-[#6B7280]">
                                    Bas&eacute; &agrave; Toulouse
                                </span>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* ── Bottom CTA ── */}
                <section className="relative px-6 py-16 text-center md:px-12 md:py-20" style={{ background: "#1A1F36" }}>
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background:
                                "radial-gradient(ellipse at 50% 50%, rgba(66,104,255,0.12) 0%, transparent 60%)",
                        }}
                    />
                    <div className="relative z-10">
                        <h2 className="mx-auto max-w-md text-[22px] font-black leading-tight tracking-tight text-white md:text-[28px]">
                            Envie de faire partie de l&rsquo;aventure ?
                        </h2>
                        <p className="mt-3 text-[14px] text-white/50">
                            Rejoignez les commer&ccedil;ants qui rendent leur stock visible.
                        </p>
                        <div className="mt-6">
                            <Link
                                href="/onboarding"
                                className="inline-block rounded-xl bg-[#4268FF] px-7 py-3.5 text-[14px] font-bold text-white no-underline transition-colors hover:bg-[#3558e6]"
                            >
                                Rejoindre l&rsquo;aventure &rarr;
                            </Link>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </LenisProvider>
    );
}

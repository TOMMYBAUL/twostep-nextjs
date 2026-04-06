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

function SyncIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.49 9A9 9 0 0 0 5.64 5.64L4 7m16 10l-1.64 1.36A9 9 0 0 1 3.51 15" />
        </svg>
    );
}

function SparklesIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
        </svg>
    );
}

function GlobeIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.729-3.558" />
        </svg>
    );
}

function PlugIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
    );
}

function CpuIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
        </svg>
    );
}

function UsersIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
    );
}

function ArrowRightIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
    );
}

function CheckIcon({ className }: { className?: string }) {
    return (
        <svg className={className || "size-5 text-[#4268FF]"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
    );
}

function XMarkIcon({ className }: { className?: string }) {
    return (
        <svg className={className || "size-5 text-[#D1D5DB]"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}

/* ── Data ── */

const features = [
    {
        icon: SyncIcon,
        title: "Synchronisation automatique",
        description:
            "Connectez votre caisse (Square, Shopify, Lightspeed, Zettle). Votre stock se met \u00e0 jour en temps r\u00e9el, sans aucune saisie manuelle.",
    },
    {
        icon: SparklesIcon,
        title: "Enrichissement IA",
        description:
            "Photos optimis\u00e9es, cat\u00e9gorisation intelligente, extraction des tailles. Vos donn\u00e9es brutes deviennent un catalogue professionnel.",
    },
    {
        icon: GlobeIcon,
        title: "Diffusion multi-canal",
        description:
            "Vos produits apparaissent sur l\u2019app Two-Step, Google Shopping et Google Maps. Visibilit\u00e9 locale et en ligne, automatiquement.",
    },
];

const steps = [
    {
        number: "01",
        icon: PlugIcon,
        title: "Connectez votre caisse",
        description: "En 2 clics, reliez votre POS existant. Aucune installation, aucune formation.",
    },
    {
        number: "02",
        icon: CpuIcon,
        title: "On enrichit tout",
        description: "Notre IA ajoute photos, descriptions, cat\u00e9gories et tailles. Votre catalogue devient professionnel.",
    },
    {
        number: "03",
        icon: UsersIcon,
        title: "Les clients arrivent",
        description: "Vos produits apparaissent dans l\u2019app, sur Google et Maps. Les clients vous trouvent et viennent.",
    },
];

const posProviders = [
    { name: "Square", comingSoon: false },
    { name: "Shopify", comingSoon: false },
    { name: "Lightspeed", comingSoon: false },
    { name: "Zettle", comingSoon: false },
    { name: "Fastmag", comingSoon: true },
    { name: "Clictill", comingSoon: true },
];

const stats = [
    { value: "+200 000", label: "commerces compatibles" },
    { value: "2 min", label: "pour se lancer" },
    { value: "0", label: "saisie manuelle" },
];

const beforeAfter = {
    before: [
        "Stock invisible en ligne",
        "Saisie manuelle des produits",
        "Pas de photos professionnelles",
        "Aucune visibilit\u00e9 Google",
        "Clients perdus au profit des boutiques en ligne",
    ],
    after: [
        "Catalogue complet visible partout",
        "Synchronisation 100% automatique",
        "Photos enrichies par IA",
        "Pr\u00e9sent sur Google Shopping et Maps",
        "Clients qui viennent en boutique",
    ],
};

/* ── Page ── */

export default function ProduitPage() {
    const heroRef = useRef<HTMLElement>(null);
    const heroInView = useInView(heroRef, { once: true, margin: "-10%" });

    const stepsRef = useRef<HTMLDivElement>(null);
    const stepsInView = useInView(stepsRef, { once: true, margin: "-10%" });

    const featuresRef = useRef<HTMLDivElement>(null);
    const featuresInView = useInView(featuresRef, { once: true, margin: "-10%" });

    const showcaseRef = useRef<HTMLDivElement>(null);
    const showcaseInView = useInView(showcaseRef, { once: true, margin: "-10%" });

    const posRef = useRef<HTMLDivElement>(null);
    const posInView = useInView(posRef, { once: true, margin: "-10%" });

    const compareRef = useRef<HTMLDivElement>(null);
    const compareInView = useInView(compareRef, { once: true, margin: "-10%" });

    const statsRef = useRef<HTMLDivElement>(null);
    const statsInView = useInView(statsRef, { once: true, margin: "-10%" });

    return (
        <LenisProvider>
            <Nav />
            <main id="produit" className="bg-white">
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
                            Produit
                        </span>
                    </motion.div>
                    <motion.h1
                        {...slideUp(0.05)}
                        animate={heroInView ? slideUp(0.05).animate : slideUp(0.05).initial}
                        className="mt-5 text-[32px] font-black leading-tight tracking-tight text-[#1A1F36] md:text-[48px]"
                    >
                        Votre caisse, connect&eacute;e<br />
                        <span className="text-[#4268FF]">au monde entier.</span>
                    </motion.h1>
                    <motion.p
                        {...slideUp(0.1)}
                        animate={heroInView ? slideUp(0.1).animate : slideUp(0.1).initial}
                        className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-[#1A1F36]/60 md:text-[17px]"
                    >
                        Two-Step lit votre POS, enrichit vos donn&eacute;es par IA, et diffuse vos
                        produits sur Google, Maps et l&rsquo;app. Automatiquement.
                    </motion.p>
                    <motion.div
                        {...slideUp(0.15)}
                        animate={heroInView ? slideUp(0.15).animate : slideUp(0.15).initial}
                        className="mt-7"
                    >
                        <Link
                            href="/onboarding"
                            className="inline-block rounded-xl bg-[#4268FF] px-7 py-3.5 text-[14px] font-bold text-white no-underline transition-colors hover:bg-[#3558e6]"
                        >
                            Connecter ma boutique &rarr;
                        </Link>
                    </motion.div>
                </section>

                {/* ── How It Works ── */}
                <section
                    ref={stepsRef}
                    className="bg-[#FAFAFA] px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[1100px]">
                        <motion.p
                            initial={{ opacity: 0, y: 32 }}
                            animate={stepsInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]"
                        >
                            COMMENT &Ccedil;A MARCHE
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 32 }}
                            animate={stepsInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.05 }}
                            className="mb-12 text-center text-[24px] font-black tracking-tight text-[#1A1F36] md:text-[32px]"
                        >
                            3 &eacute;tapes. 2 minutes. Z&eacute;ro effort.
                        </motion.h2>

                        <div className="grid gap-8 md:grid-cols-3 md:gap-6">
                            {steps.map((step, i) => {
                                const su = slideUp(stagger(i, 0.12));
                                return (
                                    <motion.div
                                        key={step.number}
                                        initial={su.initial}
                                        animate={stepsInView ? su.animate : su.initial}
                                        transition={su.transition}
                                        className="relative rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
                                    >
                                        <div className="mb-5 flex items-center gap-4">
                                            <span className="text-[36px] font-black leading-none text-[#4268FF]/15">
                                                {step.number}
                                            </span>
                                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#4268FF]/10">
                                                <step.icon className="size-5 text-[#4268FF]" />
                                            </div>
                                        </div>
                                        <h3 className="mb-2 text-[17px] font-bold tracking-tight text-[#1A1F36]">
                                            {step.title}
                                        </h3>
                                        <p className="m-0 text-[14px] leading-relaxed text-[#6B7280]">
                                            {step.description}
                                        </p>
                                        {i < steps.length - 1 && (
                                            <ArrowRightIcon className="absolute -right-5 top-1/2 hidden size-5 -translate-y-1/2 text-[#D1D5DB] md:block" />
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* ── Features Grid ── */}
                <section
                    ref={featuresRef}
                    className="bg-white px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[1100px]">
                        <motion.p
                            initial={{ opacity: 0, y: 32 }}
                            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]"
                        >
                            FONCTIONNALIT&Eacute;S
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 32 }}
                            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.05 }}
                            className="mb-12 text-center text-[24px] font-black tracking-tight text-[#1A1F36] md:text-[32px]"
                        >
                            Tout ce dont votre boutique a besoin
                        </motion.h2>

                        <div className="grid gap-8 md:grid-cols-3 md:gap-10">
                            {features.map((feat, i) => {
                                const su = slideUp(stagger(i, 0.1));
                                return (
                                    <motion.div
                                        key={feat.title}
                                        initial={su.initial}
                                        animate={featuresInView ? su.animate : su.initial}
                                        transition={su.transition}
                                        className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] p-8 transition-shadow duration-200 hover:shadow-[0_4px_24px_rgba(66,104,255,0.08)]"
                                    >
                                        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4268FF]/10">
                                            <feat.icon className="size-7 text-[#4268FF]" />
                                        </div>
                                        <h3 className="mb-3 text-[18px] font-bold tracking-tight text-[#1A1F36]">
                                            {feat.title}
                                        </h3>
                                        <p className="m-0 text-[14px] leading-relaxed text-[#6B7280]">
                                            {feat.description}
                                        </p>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* ── Image Showcase ── */}
                <section
                    ref={showcaseRef}
                    className="bg-[#FAFAFA] px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[1100px]">
                        <motion.p
                            initial={{ opacity: 0, y: 32 }}
                            animate={showcaseInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]"
                        >
                            LE PROBL&Egrave;ME
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 32 }}
                            animate={showcaseInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.05 }}
                            className="mb-12 text-center text-[24px] font-black tracking-tight text-[#1A1F36] md:text-[32px]"
                        >
                            D&rsquo;invisible &agrave; incontournable
                        </motion.h2>

                        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
                            <motion.div
                                initial={{ opacity: 0, x: -40 }}
                                animate={showcaseInView ? { opacity: 1, x: 0 } : {}}
                                transition={{ ...SPRING, delay: 0.1 }}
                                className="overflow-hidden rounded-2xl border border-[#E5E7EB] shadow-sm"
                            >
                                <Image
                                    src="/images/how-it-works/caroucel-invisible.webp"
                                    alt="Boutique ferm\u00e9e, invisible en ligne"
                                    width={600}
                                    height={400}
                                    className="h-[280px] w-full object-cover md:h-[340px]"
                                />
                                <div className="bg-white px-6 py-4">
                                    <p className="text-[13px] font-semibold text-[#1A1F36]/40">
                                        Sans Two-Step
                                    </p>
                                    <p className="mt-1 text-[14px] leading-relaxed text-[#6B7280]">
                                        Votre boutique existe, mais personne ne le sait en ligne.
                                    </p>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, x: 40 }}
                                animate={showcaseInView ? { opacity: 1, x: 0 } : {}}
                                transition={{ ...SPRING, delay: 0.2 }}
                                className="overflow-hidden rounded-2xl border border-[#4268FF]/20 shadow-[0_4px_24px_rgba(66,104,255,0.1)]"
                            >
                                <Image
                                    src="/images/how-it-works/caroucel-busy.webp"
                                    alt="Boutique pleine de clients"
                                    width={600}
                                    height={400}
                                    className="h-[280px] w-full object-cover md:h-[340px]"
                                />
                                <div className="bg-white px-6 py-4">
                                    <p className="text-[13px] font-semibold text-[#4268FF]">
                                        Avec Two-Step
                                    </p>
                                    <p className="mt-1 text-[14px] leading-relaxed text-[#6B7280]">
                                        Vos produits sont visibles. Les clients viennent.
                                    </p>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* ── POS Compatibility ── */}
                <section
                    ref={posRef}
                    className="bg-white px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[1100px] text-center">
                        <motion.p
                            initial={{ opacity: 0, y: 32 }}
                            animate={posInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]"
                        >
                            COMPATIBILIT&Eacute;
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 32 }}
                            animate={posInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.05 }}
                            className="mb-4 text-[24px] font-black tracking-tight text-[#1A1F36] md:text-[32px]"
                        >
                            Compatible avec les principales caisses
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 24 }}
                            animate={posInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.1 }}
                            className="mx-auto mb-10 max-w-md text-[15px] leading-relaxed text-[#6B7280]"
                        >
                            Pas de caisse ? On vous recommande Square (gratuit).
                        </motion.p>

                        <div className="mx-auto flex max-w-[750px] flex-wrap items-center justify-center gap-4 md:gap-5">
                            {posProviders.map((pos, i) => {
                                const su = slideUp(stagger(i, 0.08));
                                return (
                                    <motion.div
                                        key={pos.name}
                                        initial={su.initial}
                                        animate={posInView ? su.animate : su.initial}
                                        transition={su.transition}
                                        className={`flex items-center gap-3 rounded-xl border bg-white px-6 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-150 ${pos.comingSoon ? "border-dashed border-[#D1D5DB] opacity-60" : "border-[#E5E7EB] hover:border-[#4268FF]/30 hover:shadow-[0_2px_8px_rgba(66,104,255,0.1)]"}`}
                                    >
                                        <span className={`h-2 w-2 rounded-full ${pos.comingSoon ? "bg-[#F59E0B]" : "bg-[#22C55E]"}`} />
                                        <span className="text-[15px] font-semibold tracking-tight text-[#1A1F36]">
                                            {pos.name}
                                        </span>
                                        {pos.comingSoon && (
                                            <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold text-[#92400E]">
                                                bient&ocirc;t
                                            </span>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* ── Avant / Avec Comparison ── */}
                <section
                    ref={compareRef}
                    className="bg-[#FAFAFA] px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[900px]">
                        <motion.p
                            initial={{ opacity: 0, y: 32 }}
                            animate={compareInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING }}
                            className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF]"
                        >
                            COMPARAISON
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 32 }}
                            animate={compareInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ ...SPRING, delay: 0.05 }}
                            className="mb-12 text-center text-[24px] font-black tracking-tight text-[#1A1F36] md:text-[32px]"
                        >
                            Avant Two-Step vs. Avec Two-Step
                        </motion.h2>

                        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
                            {/* Before */}
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                animate={compareInView ? { opacity: 1, x: 0 } : {}}
                                transition={{ ...SPRING, delay: 0.1 }}
                                className="rounded-2xl border border-[#E5E7EB] bg-white p-7"
                            >
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FEE2E2]">
                                        <XMarkIcon className="size-5 text-[#EF4444]" />
                                    </div>
                                    <h3 className="text-[17px] font-bold text-[#1A1F36]">
                                        Avant Two-Step
                                    </h3>
                                </div>
                                <ul className="space-y-3.5">
                                    {beforeAfter.before.map((item) => (
                                        <li
                                            key={item}
                                            className="flex items-start gap-3 text-[14px] leading-snug text-[#6B7280]"
                                        >
                                            <XMarkIcon className="mt-0.5 size-4 shrink-0 text-[#D1D5DB]" />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>

                            {/* After */}
                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                animate={compareInView ? { opacity: 1, x: 0 } : {}}
                                transition={{ ...SPRING, delay: 0.2 }}
                                className="rounded-2xl border border-[#4268FF]/20 bg-white p-7 shadow-[0_4px_24px_rgba(66,104,255,0.08)]"
                            >
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4268FF]/10">
                                        <CheckIcon className="size-5 text-[#4268FF]" />
                                    </div>
                                    <h3 className="text-[17px] font-bold text-[#1A1F36]">
                                        Avec Two-Step
                                    </h3>
                                </div>
                                <ul className="space-y-3.5">
                                    {beforeAfter.after.map((item) => (
                                        <li
                                            key={item}
                                            className="flex items-start gap-3 text-[14px] leading-snug text-[#374151]"
                                        >
                                            <CheckIcon className="mt-0.5 size-4 shrink-0 text-[#4268FF]" />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* ── Stats ── */}
                <section
                    ref={statsRef}
                    className="bg-white px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto max-w-[900px]">
                        <div className="grid gap-8 md:grid-cols-3">
                            {stats.map((stat, i) => {
                                const su = slideUp(stagger(i, 0.1));
                                return (
                                    <motion.div
                                        key={stat.label}
                                        initial={su.initial}
                                        animate={statsInView ? su.animate : su.initial}
                                        transition={su.transition}
                                        className="text-center"
                                    >
                                        <p className="text-[40px] font-black tracking-tight text-[#4268FF] md:text-[52px]">
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
                            Pr&ecirc;t &agrave; rendre votre stock visible ?
                        </h2>
                        <p className="mt-3 text-[14px] text-white/50">
                            3 mois gratuits. Sans engagement. En 2 minutes.
                        </p>
                        <div className="mt-6">
                            <Link
                                href="/onboarding"
                                className="inline-block rounded-xl bg-[#4268FF] px-7 py-3.5 text-[14px] font-bold text-white no-underline transition-colors hover:bg-[#3558e6]"
                            >
                                Connecter ma boutique &rarr;
                            </Link>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </LenisProvider>
    );
}

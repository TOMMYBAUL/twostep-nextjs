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

/* ── Metadata-like title (client component — real metadata in layout or head) ── */

const features = [
    {
        icon: SyncIcon,
        title: "Synchronisation automatique",
        description:
            "Connectez votre caisse (Square, Shopify, Lightspeed, Zettle, Fastmag, Clictill). Votre stock se met \u00e0 jour en temps r\u00e9el, sans aucune saisie manuelle.",
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
            "Vos produits apparaissent sur l\u2019app Two-Step, Google Merchant et Google Maps. Visibilit\u00e9 locale et en ligne, automatiquement.",
    },
];

const posProviders = [
    "Square",
    "Shopify",
    "Lightspeed",
    "Zettle",
    "Fastmag",
    "Clictill",
];

export default function ProduitPage() {
    const featuresRef = useRef<HTMLDivElement>(null);
    const featuresInView = useInView(featuresRef, { once: true, margin: "-10%" });

    const posRef = useRef<HTMLDivElement>(null);
    const posInView = useInView(posRef, { once: true, margin: "-10%" });

    const ctaRef = useRef<HTMLDivElement>(null);
    const ctaInView = useInView(ctaRef, { once: true, margin: "-10%" });

    return (
        <LenisProvider>
            <Nav />
            <main id="produit">
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
                            PRODUIT
                        </motion.p>
                        <motion.h1
                            {...slideUp(0.15)}
                            className="font-black leading-[1.1] tracking-[-0.03em] text-[#1A1F36]"
                            style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
                        >
                            Votre caisse, connect&eacute;e au monde
                        </motion.h1>
                        <motion.p
                            {...slideUp(0.25)}
                            className="mx-auto mt-5 max-w-[520px] text-[15px] leading-relaxed text-[#6B7280] md:text-[17px]"
                        >
                            Two-Step lit votre POS, enrichit vos donn&eacute;es, et diffuse vos
                            produits partout.
                        </motion.p>
                    </div>
                </section>

                {/* ── Features ── */}
                <section
                    ref={featuresRef}
                    className="bg-[#FAFAFA] px-6 py-16 md:px-12 md:py-24"
                >
                    <div className="mx-auto grid max-w-[1100px] gap-8 md:grid-cols-3 md:gap-12">
                        {features.map((feat, i) => {
                            const su = slideUp(stagger(i, 0.1));
                            return (
                                <motion.div
                                    key={feat.title}
                                    initial={su.initial}
                                    animate={featuresInView ? su.animate : su.initial}
                                    transition={su.transition}
                                    className="rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                                >
                                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4268FF]/10">
                                        <feat.icon className="size-6 text-[#4268FF]" />
                                    </div>
                                    <h3 className="mb-2 text-[17px] font-bold tracking-tight text-[#1A1F36]">
                                        {feat.title}
                                    </h3>
                                    <p className="m-0 text-[14px] leading-relaxed text-[#6B7280]">
                                        {feat.description}
                                    </p>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>

                {/* ── Schema Image ── */}
                <section className="bg-white px-6 py-16 md:px-12 md:py-24">
                    <div className="mx-auto max-w-[900px]">
                        <motion.div {...slideUp(0.1)} className="overflow-hidden rounded-2xl border border-[#E8ECF4] bg-[#F8F9FC] p-4 shadow-sm">
                            <Image
                                src="/images/how-it-works/schema-compressed.jpg"
                                alt="Sch\u00e9ma Two-Step : Fournisseurs \u2192 Caisses POS \u2192 Two-Step \u2192 Diffusion"
                                width={900}
                                height={500}
                                className="w-full rounded-xl"
                            />
                        </motion.div>
                        <p className="mt-4 text-center text-[13px] text-[#6B7280]">
                            Comment Two-Step connecte votre caisse au monde
                        </p>
                    </div>
                </section>

                {/* ── POS Compatibility ── */}
                <section
                    ref={posRef}
                    className="bg-[#FAFAFA] px-6 py-16 md:px-12 md:py-24"
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
                            className="mb-10 text-[22px] font-[900] tracking-tight text-[#1A1F36] md:text-[32px]"
                        >
                            Compatible avec les principales caisses du march&eacute;
                        </motion.h2>

                        <div className="mx-auto flex max-w-[750px] flex-wrap items-center justify-center gap-4 md:gap-5">
                            {posProviders.map((name, i) => {
                                const su = slideUp(stagger(i, 0.1));
                                return (
                                    <motion.div
                                        key={name}
                                        initial={su.initial}
                                        animate={posInView ? su.animate : su.initial}
                                        transition={su.transition}
                                        className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-6 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-150 hover:border-[#4268FF]/30 hover:shadow-[0_2px_8px_rgba(66,104,255,0.1)]"
                                    >
                                        <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                                        <span className="text-[15px] font-semibold tracking-tight text-[#1A1F36]">
                                            {name}
                                        </span>
                                    </motion.div>
                                );
                            })}
                        </div>
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
                                "radial-gradient(ellipse at 50% 40%, rgba(66,104,255,0.12) 0%, transparent 70%)",
                        }}
                    />

                    <h2 className="relative mx-auto max-w-md text-[22px] font-[900] leading-tight tracking-tight text-white md:text-[28px]">
                        Pr&ecirc;t &agrave; rendre votre stock visible ?
                    </h2>
                    <p className="relative mt-3 text-[13px] text-white/80">
                        Connexion en 2 minutes. Gratuit pour d&eacute;marrer.
                    </p>
                    <div className="relative mt-6">
                        <Link
                            href="/onboarding"
                            className="inline-block rounded-xl bg-[#4268FF] px-7 py-3 text-[14px] font-[800] text-white transition-colors duration-200 hover:bg-[#3558e6]"
                        >
                            Connecter ma boutique &rarr;
                        </Link>
                    </div>
                </motion.section>
            </main>
            <Footer />
        </LenisProvider>
    );
}

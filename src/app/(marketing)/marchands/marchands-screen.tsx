"use client";

import Link from "next/link";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { slideUp, stagger } from "@/lib/motion";
import { Nav } from "../sections/nav";
import { Footer } from "../sections/footer";
import { LenisProvider } from "../components/lenis-provider";

/* ── Data ──────────────────────────────────────────────────────────── */

const problems = [
    {
        problem: "Votre stock est invisible",
        solution:
            "Two-Step lit votre caisse et publie vos produits en ligne automatiquement. Zéro saisie.",
        icon: (
            <svg className="size-6 text-[#4268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878l4.242 4.242M21 21l-4.879-4.879" />
            </svg>
        ),
    },
    {
        problem: "Les clients ne savent pas que vous existez",
        solution:
            "Vos produits apparaissent sur Google, Google Maps et l'app Two-Step. Les clients à proximité vous trouvent.",
        icon: (
            <svg className="size-6 text-[#4268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        ),
    },
    {
        problem: "Vous n'avez pas le temps",
        solution:
            "Connexion en 2 minutes. Ensuite, tout est automatique. On enrichit même vos photos et descriptions avec l'IA.",
        icon: (
            <svg className="size-6 text-[#4268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
];

const steps = [
    {
        number: "1",
        title: "Connectez votre caisse",
        desc: "Square, Shopify, Lightspeed, Zettle — Fastmag et Clictill bientôt",
    },
    {
        number: "2",
        title: "On s'occupe du reste",
        desc: "Enrichissement, catégorisation, mise en ligne",
    },
    {
        number: "3",
        title: "Les clients viennent à vous",
        desc: "Ils voient votre stock, cliquent sur 'J'arrive', et passent en boutique",
    },
];

/* ── Page ──────────────────────────────────────────────────────────── */

export default function MarchandsScreen() {
    const heroRef = useRef<HTMLElement>(null);
    const heroInView = useInView(heroRef, { once: true, margin: "-10%" });
    const problemsRef = useRef<HTMLDivElement>(null);
    const problemsInView = useInView(problemsRef, { once: true, margin: "-10%" });
    const testimonialRef = useRef<HTMLDivElement>(null);
    const testimonialInView = useInView(testimonialRef, { once: true, margin: "-10%" });
    const stepsRef = useRef<HTMLDivElement>(null);
    const stepsInView = useInView(stepsRef, { once: true, margin: "-10%" });
    const ctaRef = useRef<HTMLDivElement>(null);
    const ctaInView = useInView(ctaRef, { once: true, margin: "-10%" });

    return (
        <LenisProvider>
            <Nav />
            <main id="marchands-page" className="bg-white">
                {/* Hero */}
                <section
                    ref={heroRef}
                    className="px-6 pt-28 pb-14 text-center md:px-12 md:pt-36 md:pb-20"
                >
                    <motion.h1
                        {...slideUp(0)}
                        animate={heroInView ? slideUp(0).animate : slideUp(0).initial}
                        className="mx-auto max-w-[640px] text-[32px] font-black leading-tight tracking-tight text-[#1A1F36] md:text-[48px]"
                    >
                        Faites-vous trouver par vos{" "}
                        <span className="text-[#4268FF]">futurs clients</span>
                    </motion.h1>
                    <motion.p
                        {...slideUp(0.1)}
                        animate={heroInView ? slideUp(0.1).animate : slideUp(0.1).initial}
                        className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-[#1A1F36]/60 md:text-[17px]"
                    >
                        Vos produits sont en boutique. Vos clients sont sur leur téléphone. Two-Step fait le lien.
                    </motion.p>
                </section>

                {/* Problem / Solution blocks */}
                <section className="mx-auto max-w-[960px] px-6 pb-16 md:px-12 md:pb-24">
                    <div ref={problemsRef} className="grid gap-6 md:grid-cols-3">
                        {problems.map((item, i) => {
                            const su = slideUp(stagger(i, 0.1));
                            return (
                                <motion.div
                                    key={item.problem}
                                    initial={su.initial}
                                    animate={problemsInView ? su.animate : su.initial}
                                    transition={su.transition}
                                    className="rounded-2xl border border-[#E5E7EB] p-6 shadow-[0_2px_16px_rgba(0,0,0,0.05)] md:p-7"
                                >
                                    {/* Icon */}
                                    <div className="flex size-10 items-center justify-center rounded-xl bg-[#4268FF]/10">
                                        {item.icon}
                                    </div>

                                    {/* Problem */}
                                    <h3 className="mt-4 text-[16px] font-bold text-[#1A1F36]">
                                        {item.problem}
                                    </h3>

                                    {/* Divider */}
                                    <div className="my-3 h-px bg-[#E5E7EB]" />

                                    {/* Solution */}
                                    <p className="text-[14px] leading-relaxed text-[#1A1F36]/60">
                                        {item.solution}
                                    </p>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>

                {/* Market facts */}
                <section className="px-6 pb-16 md:px-12 md:pb-24">
                    <div
                        ref={testimonialRef}
                        className="mx-auto grid max-w-[960px] gap-4 md:grid-cols-3 md:gap-6"
                    >
                        {[
                            {
                                stat: "95%",
                                label: "du stock en boutique est invisible en ligne",
                            },
                            {
                                stat: "200 000+",
                                label: "commerces déjà compatibles avec Two-Step",
                            },
                            {
                                stat: "72%",
                                label: "des consommateurs vérifient le stock avant de se déplacer",
                            },
                        ].map((fact, i) => {
                            const su = slideUp(stagger(i, 0.12));
                            return (
                                <motion.div
                                    key={fact.stat}
                                    initial={su.initial}
                                    animate={testimonialInView ? su.animate : su.initial}
                                    transition={su.transition}
                                    className="rounded-2xl bg-[#1A1F36] px-6 py-8 text-center md:px-8 md:py-10"
                                >
                                    <p className="text-[32px] font-black leading-none tracking-tight text-white">
                                        {fact.stat}
                                    </p>
                                    <p className="mt-3 text-[14px] leading-relaxed text-white/60">
                                        {fact.label}
                                    </p>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>

                {/* How it works */}
                <section className="bg-[#FAFAFA] px-6 py-16 md:px-12 md:py-24">
                    <motion.h2
                        {...slideUp(0)}
                        animate={stepsInView ? slideUp(0).animate : slideUp(0).initial}
                        className="text-center text-[24px] font-bold text-[#1A1F36] md:text-[28px]"
                    >
                        Comment ça marche
                    </motion.h2>

                    <div
                        ref={stepsRef}
                        className="mx-auto mt-10 grid max-w-[900px] gap-8 md:mt-12 md:grid-cols-3 md:gap-6"
                    >
                        {steps.map((step, i) => {
                            const su = slideUp(stagger(i, 0.15));
                            return (
                                <motion.div
                                    key={step.number}
                                    initial={su.initial}
                                    animate={stepsInView ? su.animate : su.initial}
                                    transition={su.transition}
                                    className="text-center"
                                >
                                    <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-[#4268FF] text-[16px] font-bold text-white">
                                        {step.number}
                                    </div>
                                    <h3 className="mt-4 text-[16px] font-bold text-[#1A1F36]">
                                        {step.title}
                                    </h3>
                                    <p className="mt-2 text-[14px] leading-relaxed text-[#1A1F36]/55">
                                        {step.desc}
                                    </p>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>

                {/* CTA */}
                <section className="px-6 py-16 text-center md:px-12 md:py-24">
                    <motion.div
                        ref={ctaRef}
                        initial={slideUp(0).initial}
                        animate={ctaInView ? slideUp(0).animate : slideUp(0).initial}
                        transition={slideUp(0).transition}
                    >
                        <Link
                            href="/onboarding"
                            className="inline-flex items-center rounded-xl bg-[#4268FF] px-7 py-3.5 text-[15px] font-bold text-white transition duration-100 ease-linear no-underline hover:bg-[#3558e6] active:scale-[0.97]"
                        >
                            Inscrire ma boutique gratuitement →
                        </Link>
                        <p className="mt-4 text-[13px] text-[#1A1F36]/40">
                            Gratuit, sans engagement, en 2 minutes.
                        </p>
                    </motion.div>
                </section>
            </main>
            <Footer />
        </LenisProvider>
    );
}

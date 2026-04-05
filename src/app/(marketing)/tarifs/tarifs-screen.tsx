"use client";

import Link from "next/link";
import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";
import { slideUp, stagger } from "@/lib/motion";
import { Nav } from "../sections/nav";
import { Footer } from "../sections/footer";
import { LenisProvider } from "../components/lenis-provider";

/* ── Data ──────────────────────────────────────────────────────────── */

const tiers = [
    {
        name: "Starter",
        badge: "Gratuit",
        price: "0€",
        period: "/ mois",
        features: [
            "Connexion POS (1 caisse)",
            "Jusqu'à 100 produits",
            "Synchronisation stock",
            "Page boutique sur Two-Step",
            "Enrichissement IA basique",
        ],
        cta: "Commencer gratuitement",
        href: "/onboarding",
        highlighted: false,
    },
    {
        name: "Pro",
        badge: "Populaire",
        price: "Sur mesure",
        period: "",
        features: [
            "Tout le plan Starter +",
            "Produits illimités",
            "Google Merchant & Maps",
            "Enrichissement IA avancé",
            "Dashboard analytics complet",
            "Support prioritaire",
        ],
        cta: "Nous contacter",
        href: "mailto:contact@twostep.fr",
        highlighted: true,
    },
];

const faqs = [
    {
        q: "Est-ce vraiment gratuit ?",
        a: "Oui. Le plan Starter est gratuit, sans limite de temps. Vous pouvez connecter votre caisse et rendre vos produits visibles dès aujourd'hui.",
    },
    {
        q: "Quelles caisses sont compatibles ?",
        a: "Square, Shopify, Lightspeed, Zettle, Fastmag et Clictill. Si votre caisse n'est pas dans la liste, contactez-nous.",
    },
    {
        q: "Combien de temps pour se lancer ?",
        a: "Moins de 2 minutes. Vous connectez votre caisse, et vos produits apparaissent automatiquement.",
    },
    {
        q: "Puis-je annuler à tout moment ?",
        a: "Oui, sans engagement. Vous pouvez supprimer votre compte à tout moment.",
    },
];

/* ── FAQ Item ──────────────────────────────────────────────────────── */

function FAQItem({ q, a, delay }: { q: string; a: string; delay: number }) {
    const [open, setOpen] = useState(false);
    return (
        <motion.div
            {...slideUp(delay)}
            className="border-b border-[#E5E7EB] last:border-b-0"
        >
            <button
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between py-5 text-left"
            >
                <span className="text-[15px] font-semibold text-[#1A1F36]">
                    {q}
                </span>
                <span
                    className="ml-4 shrink-0 text-[18px] text-[#1A1F36]/50 transition-transform duration-200"
                    style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
                >
                    +
                </span>
            </button>
            <motion.div
                initial={false}
                animate={{
                    height: open ? "auto" : 0,
                    opacity: open ? 1 : 0,
                }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
            >
                <p className="pb-5 text-[14px] leading-relaxed text-[#1A1F36]/60">
                    {a}
                </p>
            </motion.div>
        </motion.div>
    );
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function TarifsScreen() {
    const heroRef = useRef<HTMLElement>(null);
    const heroInView = useInView(heroRef, { once: true, margin: "-10%" });
    const faqRef = useRef<HTMLDivElement>(null);
    const faqInView = useInView(faqRef, { once: true, margin: "-10%" });

    return (
        <LenisProvider>
            <Nav />
            <main id="tarifs" className="bg-white">
                {/* Hero */}
                <section
                    ref={heroRef}
                    className="px-6 pt-28 pb-12 text-center md:px-12 md:pt-36 md:pb-16"
                >
                    <motion.h1
                        {...slideUp(0)}
                        animate={heroInView ? slideUp(0).animate : slideUp(0).initial}
                        className="text-[32px] font-black leading-tight tracking-tight text-[#1A1F36] md:text-[48px]"
                    >
                        Gratuit pour commencer
                    </motion.h1>
                    <motion.p
                        {...slideUp(0.1)}
                        animate={heroInView ? slideUp(0.1).animate : slideUp(0.1).initial}
                        className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[#1A1F36]/60 md:text-[17px]"
                    >
                        Pas d&apos;engagement, pas de carte bancaire. Votre boutique en ligne en 2 minutes.
                    </motion.p>
                </section>

                {/* Pricing cards */}
                <section className="mx-auto max-w-[820px] px-6 pb-16 md:px-12 md:pb-24">
                    <div className="grid gap-6 md:grid-cols-2">
                        {tiers.map((tier, i) => {
                            const su = slideUp(stagger(i, 0.15));
                            return (
                                <motion.div
                                    key={tier.name}
                                    initial={su.initial}
                                    animate={heroInView ? su.animate : su.initial}
                                    transition={su.transition}
                                    className={[
                                        "relative flex flex-col rounded-2xl border p-7 md:p-8",
                                        "shadow-[0_2px_16px_rgba(0,0,0,0.06)]",
                                        tier.highlighted
                                            ? "border-[#4268FF] ring-1 ring-[#4268FF]/20"
                                            : "border-[#E5E7EB]",
                                    ].join(" ")}
                                >
                                    {/* Badge */}
                                    <span
                                        className={[
                                            "inline-flex self-start rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase",
                                            tier.highlighted
                                                ? "bg-[#4268FF] text-white"
                                                : "bg-[#F3F4F6] text-[#1A1F36]/70",
                                        ].join(" ")}
                                    >
                                        {tier.badge}
                                    </span>

                                    {/* Name */}
                                    <h3 className="mt-4 text-[20px] font-bold text-[#1A1F36]">
                                        {tier.name}
                                    </h3>

                                    {/* Price */}
                                    <div className="mt-3 flex items-baseline gap-1">
                                        <span className="text-[36px] font-black tracking-tight text-[#1A1F36]">
                                            {tier.price}
                                        </span>
                                        {tier.period && (
                                            <span className="text-[14px] text-[#1A1F36]/50">
                                                {tier.period}
                                            </span>
                                        )}
                                    </div>

                                    {/* Divider */}
                                    <div className="my-5 h-px bg-[#E5E7EB]" />

                                    {/* Features */}
                                    <ul className="flex-1 space-y-3">
                                        {tier.features.map((f) => (
                                            <li
                                                key={f}
                                                className="flex items-start gap-2.5 text-[14px] text-[#1A1F36]/70"
                                            >
                                                <svg
                                                    className="mt-0.5 size-4 shrink-0 text-[#4268FF]"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    strokeWidth={2.5}
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M5 13l4 4L19 7"
                                                    />
                                                </svg>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>

                                    {/* CTA */}
                                    <Link
                                        href={tier.href}
                                        className={[
                                            "mt-7 block rounded-xl py-3.5 text-center text-[14px] font-bold transition duration-100 ease-linear no-underline",
                                            tier.highlighted
                                                ? "bg-[#4268FF] text-white hover:bg-[#3558e6]"
                                                : "border border-[#4268FF] text-[#4268FF] hover:bg-[#4268FF]/5",
                                        ].join(" ")}
                                    >
                                        {tier.cta}
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>

                {/* Trust signals */}
                <div className="flex flex-wrap items-center justify-center gap-8 px-6 pb-14 md:pb-18">
                    {[
                        {
                            text: "Sans engagement",
                            icon: (
                                <svg className="size-5 text-[#4268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            ),
                        },
                        {
                            text: "Sans carte bancaire",
                            icon: (
                                <svg className="size-5 text-[#4268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                            ),
                        },
                        {
                            text: "Setup en 2 minutes",
                            icon: (
                                <svg className="size-5 text-[#4268FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            ),
                        },
                    ].map((signal) => (
                        <div key={signal.text} className="flex items-center gap-2">
                            {signal.icon}
                            <span className="text-[13px] font-medium text-[#6B7280]">{signal.text}</span>
                        </div>
                    ))}
                </div>

                {/* FAQ */}
                <section className="mx-auto max-w-[640px] px-6 pb-20 md:px-12 md:pb-28">
                    <motion.h2
                        {...slideUp(0)}
                        animate={faqInView ? slideUp(0).animate : slideUp(0).initial}
                        className="text-center text-[24px] font-bold text-[#1A1F36] md:text-[28px]"
                    >
                        Questions fréquentes
                    </motion.h2>

                    <div ref={faqRef} className="mt-8">
                        {faqs.map((faq, i) => (
                            <FAQItem
                                key={faq.q}
                                q={faq.q}
                                a={faq.a}
                                delay={stagger(i, 0.1)}
                            />
                        ))}
                    </div>
                </section>
            </main>

            {/* Bottom CTA */}
            <section className="relative px-6 py-16 text-center md:px-12 md:py-20" style={{ background: "#1A1F36" }}>
                <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(66,104,255,0.12) 0%, transparent 60%)" }} />
                <div className="relative z-10">
                    <h2 className="mx-auto max-w-md text-[22px] font-[900] leading-tight tracking-tight text-white md:text-[28px]">
                        Prêt à rendre votre stock visible ?
                    </h2>
                    <p className="mt-3 text-[13px] text-white/50">
                        Gratuit, sans engagement, en 2 minutes.
                    </p>
                    <div className="mt-6">
                        <a href="/onboarding" className="inline-block rounded-xl bg-[#4268FF] px-7 py-3 text-[14px] font-[800] text-white no-underline transition-colors hover:bg-[#3558e6]">
                            Commencer gratuitement →
                        </a>
                    </div>
                </div>
            </section>

            <Footer />
        </LenisProvider>
    );
}

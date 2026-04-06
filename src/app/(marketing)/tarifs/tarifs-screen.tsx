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
        name: "Découverte",
        description: "Pour tester Two-Step gratuitement et voir les résultats.",
        price: "0€",
        priceDetail: "pendant 3 mois",
        features: [
            { text: "Produits illimités", included: true },
            { text: "Synchronisation stock automatique", included: true },
            { text: "Page boutique Two-Step", included: true },
            { text: "Visible sur la carte", included: true },
            { text: "Notifications \"J'arrive\"", included: true },
            { text: "Enrichissement photos IA", included: true },
            { text: "Support par email", included: true },
        ],
        cta: "Commencer gratuitement",
        href: "/onboarding",
        highlighted: false,
        badge: null,
    },
    {
        name: "Pro",
        description: "Tout ce qu'il faut pour attirer des clients en boutique.",
        price: "49€",
        priceDetail: "/ mois",
        features: [
            { text: "Tout le plan Découverte", included: true },
            { text: "Google Shopping & Maps", included: true },
            { text: "Dashboard analytics complet", included: true },
            { text: "Enrichissement IA avancé", included: true },
            { text: "Promotions et soldes", included: true },
            { text: "Pipeline fournisseurs", included: true },
            { text: "Support prioritaire", included: true },
        ],
        cta: "Essayer gratuitement",
        href: "/onboarding",
        highlighted: true,
        badge: "Le plus populaire",
    },
    {
        name: "Business",
        description: "Pour les enseignes avec plusieurs points de vente.",
        price: "Sur mesure",
        priceDetail: null,
        features: [
            { text: "Tout le plan Pro", included: true },
            { text: "Multi-boutiques", included: true },
            { text: "Rapports consolidés", included: true },
            { text: "Intégration POS sur mesure", included: true },
            { text: "Onboarding personnalisé", included: true },
            { text: "Gestionnaire de compte dédié", included: true },
            { text: "SLA garanti", included: true },
        ],
        cta: "Nous contacter",
        href: "mailto:contact@twostep.fr",
        highlighted: false,
        badge: null,
    },
];

const comparisons = [
    { feature: "Produits", free: "Illimités", pro: "Illimités", business: "Illimités" },
    { feature: "Sync stock automatique", free: true, pro: true, business: true },
    { feature: "Page boutique", free: true, pro: true, business: true },
    { feature: "Visible sur la carte", free: true, pro: true, business: true },
    { feature: "Notifications \"J'arrive\"", free: true, pro: true, business: true },
    { feature: "Enrichissement photos IA", free: "Basique", pro: "Avancé", business: "Avancé" },
    { feature: "Google Shopping & Maps", free: false, pro: true, business: true },
    { feature: "Dashboard analytics", free: "Basique", pro: "Complet", business: "Complet" },
    { feature: "Promotions & soldes", free: false, pro: true, business: true },
    { feature: "Pipeline fournisseurs", free: false, pro: true, business: true },
    { feature: "Multi-boutiques", free: false, pro: false, business: true },
    { feature: "Support", free: "Email", pro: "Prioritaire", business: "Dédié" },
];

const faqs = [
    {
        q: "Comment fonctionne l'essai gratuit ?",
        a: "Vous avez 3 mois pour tester toutes les fonctionnalités gratuitement. Pas de carte bancaire requise. À la fin de l'essai, vous choisissez de continuer ou non.",
    },
    {
        q: "Quelles caisses sont compatibles ?",
        a: "Square, Shopify, Lightspeed, Zettle — et bientôt Fastmag et Clictill. Si vous n'avez pas de caisse, on vous recommande Square (gratuit).",
    },
    {
        q: "Combien de temps pour se lancer ?",
        a: "Moins de 2 minutes. Vous connectez votre caisse, et vos produits apparaissent automatiquement. Zéro saisie.",
    },
    {
        q: "Puis-je annuler à tout moment ?",
        a: "Oui, sans engagement. Vous pouvez annuler votre abonnement à tout moment depuis les paramètres.",
    },
    {
        q: "Est-ce que ça fonctionne si je n'ai pas de photos produit ?",
        a: "Oui. Notre IA enrichit automatiquement vos fiches produit avec des photos, descriptions et catégories. Vous n'avez rien à faire.",
    },
    {
        q: "Comment Two-Step m'apporte des clients ?",
        a: "Vos produits apparaissent dans l'app Two-Step, sur Google Shopping et Google Maps. Les consommateurs qui cherchent un produit près de chez eux voient votre boutique et viennent.",
    },
];

/* ── Components ──────────────────────────────────────────────────── */

function CheckIcon({ className }: { className?: string }) {
    return (
        <svg className={className || "size-5 text-[#4268FF]"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
    );
}

function XIcon({ className }: { className?: string }) {
    return (
        <svg className={className || "size-5 text-[#D1D5DB]"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}

function FAQItem({ q, a, delay }: { q: string; a: string; delay: number }) {
    const [open, setOpen] = useState(false);
    return (
        <motion.div {...slideUp(delay)} className="border-b border-[#E5E7EB] last:border-b-0">
            <button
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between py-5 text-left"
            >
                <span className="text-[15px] font-semibold text-[#1A1F36]">{q}</span>
                <span
                    className="ml-4 shrink-0 text-[18px] text-[#1A1F36]/50 transition-transform duration-200"
                    style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
                >
                    +
                </span>
            </button>
            <motion.div
                initial={false}
                animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
            >
                <p className="pb-5 text-[14px] leading-relaxed text-[#1A1F36]/60">{a}</p>
            </motion.div>
        </motion.div>
    );
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function TarifsScreen() {
    const heroRef = useRef<HTMLElement>(null);
    const heroInView = useInView(heroRef, { once: true, margin: "-10%" });
    const tableRef = useRef<HTMLDivElement>(null);
    const tableInView = useInView(tableRef, { once: true, margin: "-10%" });
    const faqRef = useRef<HTMLDivElement>(null);
    const faqInView = useInView(faqRef, { once: true, margin: "-10%" });

    return (
        <LenisProvider>
            <Nav />
            <main id="tarifs" className="bg-white">

                {/* ── Hero ── */}
                <section ref={heroRef} className="px-6 pt-28 pb-10 text-center md:px-12 md:pt-36 md:pb-14">
                    <motion.div {...slideUp(0)} animate={heroInView ? slideUp(0).animate : slideUp(0).initial}>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#4268FF]/10 px-3.5 py-1 text-[12px] font-semibold text-[#4268FF]">
                            Gratuit pendant 3 mois
                        </span>
                    </motion.div>
                    <motion.h1
                        {...slideUp(0.05)}
                        animate={heroInView ? slideUp(0.05).animate : slideUp(0.05).initial}
                        className="mt-5 text-[32px] font-black leading-tight tracking-tight text-[#1A1F36] md:text-[48px]"
                    >
                        Un prix simple.<br />
                        <span className="text-[#4268FF]">Un ROI immédiat.</span>
                    </motion.h1>
                    <motion.p
                        {...slideUp(0.1)}
                        animate={heroInView ? slideUp(0.1).animate : slideUp(0.1).initial}
                        className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-[#1A1F36]/60 md:text-[17px]"
                    >
                        Un seul client ramené en boutique rembourse votre mois. Essayez gratuitement, sans carte bancaire.
                    </motion.p>
                </section>

                {/* ── Pricing Cards ── */}
                <section className="mx-auto max-w-[1100px] px-6 pb-16 md:px-12 md:pb-20">
                    <div className="grid gap-6 md:grid-cols-3">
                        {tiers.map((tier, i) => {
                            const su = slideUp(stagger(i, 0.12));
                            return (
                                <motion.div
                                    key={tier.name}
                                    initial={su.initial}
                                    animate={heroInView ? su.animate : su.initial}
                                    transition={su.transition}
                                    className={[
                                        "relative flex flex-col rounded-2xl border p-7 md:p-8",
                                        tier.highlighted
                                            ? "border-[#4268FF] shadow-[0_4px_24px_rgba(66,104,255,0.15)]"
                                            : "border-[#E5E7EB] shadow-[0_2px_12px_rgba(0,0,0,0.04)]",
                                    ].join(" ")}
                                >
                                    {/* Badge */}
                                    {tier.badge && (
                                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#4268FF] px-4 py-1 text-[11px] font-bold tracking-wide uppercase text-white">
                                            {tier.badge}
                                        </span>
                                    )}

                                    {/* Name + description */}
                                    <h3 className="text-[18px] font-bold text-[#1A1F36]">{tier.name}</h3>
                                    <p className="mt-1 text-[13px] leading-relaxed text-[#1A1F36]/50">{tier.description}</p>

                                    {/* Price */}
                                    <div className="mt-5 flex items-baseline gap-1">
                                        <span className="text-[40px] font-black tracking-tight text-[#1A1F36]">{tier.price}</span>
                                        {tier.priceDetail && (
                                            <span className="text-[14px] text-[#1A1F36]/40">{tier.priceDetail}</span>
                                        )}
                                    </div>

                                    {/* CTA */}
                                    <Link
                                        href={tier.href}
                                        className={[
                                            "mt-6 block rounded-xl py-3.5 text-center text-[14px] font-bold transition duration-100 ease-linear no-underline",
                                            tier.highlighted
                                                ? "bg-[#4268FF] text-white hover:bg-[#3558e6]"
                                                : "border border-[#E5E7EB] text-[#1A1F36] hover:bg-[#F9FAFB]",
                                        ].join(" ")}
                                    >
                                        {tier.cta}
                                    </Link>

                                    {/* Divider */}
                                    <div className="my-6 h-px bg-[#E5E7EB]" />

                                    {/* Features */}
                                    <ul className="flex-1 space-y-3">
                                        {tier.features.map((f) => (
                                            <li key={f.text} className="flex items-start gap-2.5 text-[14px] text-[#1A1F36]/70">
                                                <CheckIcon className="mt-0.5 size-4 shrink-0 text-[#4268FF]" />
                                                {f.text}
                                            </li>
                                        ))}
                                    </ul>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>

                {/* ── Trust Signals ── */}
                <div className="flex flex-wrap items-center justify-center gap-8 px-6 pb-16 md:pb-20">
                    {[
                        { text: "Sans engagement", icon: "🔓" },
                        { text: "Sans carte bancaire", icon: "💳" },
                        { text: "Setup en 2 minutes", icon: "⚡" },
                        { text: "Annulable à tout moment", icon: "✓" },
                    ].map((s) => (
                        <div key={s.text} className="flex items-center gap-2">
                            <span className="text-[16px]">{s.icon}</span>
                            <span className="text-[13px] font-medium text-[#6B7280]">{s.text}</span>
                        </div>
                    ))}
                </div>

                {/* ── Comparison Table ── */}
                <section ref={tableRef} className="mx-auto max-w-[900px] px-6 pb-20 md:px-12 md:pb-28">
                    <motion.h2
                        {...slideUp(0)}
                        animate={tableInView ? slideUp(0).animate : slideUp(0).initial}
                        className="mb-8 text-center text-[24px] font-bold text-[#1A1F36] md:text-[28px]"
                    >
                        Comparer les plans
                    </motion.h2>

                    <motion.div
                        {...slideUp(0.1)}
                        animate={tableInView ? slideUp(0.1).animate : slideUp(0.1).initial}
                        className="overflow-x-auto rounded-xl border border-[#E5E7EB]"
                    >
                        <table className="w-full text-left text-[14px]">
                            <thead>
                                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                                    <th className="px-5 py-4 font-semibold text-[#1A1F36]">Fonctionnalité</th>
                                    <th className="px-5 py-4 text-center font-semibold text-[#1A1F36]">Découverte</th>
                                    <th className="px-5 py-4 text-center font-semibold text-[#4268FF]">Pro</th>
                                    <th className="px-5 py-4 text-center font-semibold text-[#1A1F36]">Business</th>
                                </tr>
                            </thead>
                            <tbody>
                                {comparisons.map((row, i) => (
                                    <tr key={row.feature} className={i < comparisons.length - 1 ? "border-b border-[#F3F4F6]" : ""}>
                                        <td className="px-5 py-3.5 text-[#1A1F36]/70">{row.feature}</td>
                                        {[row.free, row.pro, row.business].map((val, j) => (
                                            <td key={j} className="px-5 py-3.5 text-center">
                                                {val === true ? <CheckIcon className="mx-auto size-4 text-[#4268FF]" /> :
                                                 val === false ? <XIcon className="mx-auto size-4 text-[#D1D5DB]" /> :
                                                 <span className="text-[13px] text-[#1A1F36]/60">{val}</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </motion.div>
                </section>

                {/* ── FAQ ── */}
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
                            <FAQItem key={faq.q} q={faq.q} a={faq.a} delay={stagger(i, 0.08)} />
                        ))}
                    </div>
                </section>
            </main>

            {/* ── Bottom CTA ── */}
            <section className="relative px-6 py-16 text-center md:px-12 md:py-20" style={{ background: "#1A1F36" }}>
                <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(66,104,255,0.12) 0%, transparent 60%)" }} />
                <div className="relative z-10">
                    <h2 className="mx-auto max-w-md text-[22px] font-black leading-tight tracking-tight text-white md:text-[28px]">
                        Prêt à rendre votre stock visible ?
                    </h2>
                    <p className="mt-3 text-[14px] text-white/50">
                        3 mois gratuits. Sans engagement. En 2 minutes.
                    </p>
                    <div className="mt-6">
                        <Link href="/onboarding" className="inline-block rounded-xl bg-[#4268FF] px-7 py-3.5 text-[14px] font-bold text-white no-underline transition-colors hover:bg-[#3558e6]">
                            Commencer gratuitement →
                        </Link>
                    </div>
                </div>
            </section>

            <Footer />
        </LenisProvider>
    );
}

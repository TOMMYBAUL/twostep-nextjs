"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import { slideUp, stagger } from "@/lib/motion";
import { Nav } from "../sections/nav";
import { Footer } from "../sections/footer";
import { LenisProvider } from "../components/lenis-provider";

/* ── Data ──────────────────────────────────────────────────────────── */

const tiers = [
    {
        name: "Pionnier",
        description: "Les 30 premiers marchands. Un tarif exclusif, verrouillé à vie.",
        price: "19€",
        priceDetail: "/ mois",
        features: [
            { text: "2 mois d'essai gratuit", included: true },
            { text: "Produits illimités", included: true },
            { text: "Import catalogue CSV/Excel", included: true },
            { text: "Enrichissement photos IA", included: true },
            { text: "Page boutique Two-Step", included: true },
            { text: "Visible sur la carte", included: true },
            { text: "Notifications \"J'arrive\"", included: true },
            { text: "Google Shopping & Google Maps", included: true },
            { text: "Import factures fournisseur", included: true },
            { text: "Synchro POS automatique (si compatible)", included: true },
            { text: "Support prioritaire", included: true },
        ],
        cta: "Essayer 2 mois gratuit",
        href: "/auth/login?role=merchant",
        highlighted: true,
        badge: "30 places",
    },
    {
        name: "Early Adopter",
        description: "Du 31ᵉ au 50ᵉ marchand. Tout inclus, même fonctionnalités.",
        price: "29€",
        priceDetail: "/ mois",
        features: [
            { text: "2 mois d'essai gratuit", included: true },
            { text: "Toutes les fonctionnalités Pionnier", included: true },
            { text: "Enrichissement IA photos + catégories", included: true },
            { text: "Récap du jour (décrémentation simplifiée)", included: true },
            { text: "Dashboard gestion de stock", included: true },
            { text: "Support par email", included: true },
        ],
        cta: "Essayer 2 mois gratuit",
        href: "/auth/login?role=merchant",
        highlighted: false,
        badge: null,
    },
    {
        name: "Standard",
        description: "À partir du 51ᵉ marchand. Le tarif normal Two-Step.",
        price: "39€",
        priceDetail: "/ mois",
        features: [
            { text: "2 mois d'essai gratuit", included: true },
            { text: "Toutes les fonctionnalités incluses", included: true },
            { text: "Multi-boutiques disponible", included: true },
            { text: "Intégration POS sur mesure", included: true },
            { text: "Onboarding personnalisé", included: true },
            { text: "Support par email", included: true },
        ],
        cta: "Essayer 2 mois gratuit",
        href: "/auth/login?role=merchant",
        highlighted: false,
        badge: null,
    },
];

const comparisons = [
    { feature: "Produits illimités", free: true, pro: true, business: true },
    { feature: "Import catalogue CSV/Excel", free: true, pro: true, business: true },
    { feature: "Enrichissement photos IA", free: true, pro: true, business: true },
    { feature: "Page boutique", free: true, pro: true, business: true },
    { feature: "Visible sur la carte", free: true, pro: true, business: true },
    { feature: "Notifications \"J'arrive\"", free: true, pro: true, business: true },
    { feature: "Google Shopping & Maps", free: true, pro: true, business: true },
    { feature: "Import factures fournisseur", free: true, pro: true, business: true },
    { feature: "Synchro POS automatique", free: true, pro: true, business: true },
    { feature: "Récap du jour", free: true, pro: true, business: true },
    { feature: "Multi-boutiques", free: false, pro: false, business: true },
    { feature: "Support", free: "Prioritaire", pro: "Email", business: "Email" },
];

const faqs = [
    {
        q: "Comment fonctionne l'essai gratuit ?",
        a: "Vous commencez par 2 mois gratuits, sans carte bancaire. Votre tarif ensuite dépend de quand vous nous rejoignez : les 30 premiers marchands paient 19€/mois (verrouillé à vie), puis c'est 29€, puis 39€. Plus vous venez tôt, moins vous payez — et ce tarif ne changera jamais.",
    },
    {
        q: "Mon logiciel de caisse est-il compatible ?",
        a: "Oui, tous les logiciels sont compatibles. Vous exportez votre catalogue en CSV ou Excel depuis votre logiciel actuel (SumUp, Zettle, Lightspeed, ProgMag, ou tout autre), et on s'occupe du reste. Pour Square, Shopify, Lightspeed et Zettle, la synchronisation est même automatique.",
    },
    {
        q: "Combien de temps pour se lancer ?",
        a: "Environ 10 minutes. Vous exportez votre catalogue, vous l'importez dans Two-Step, et nos algorithmes enrichissent automatiquement chaque produit avec photos et descriptions.",
    },
    {
        q: "Puis-je annuler à tout moment ?",
        a: "Oui, sans engagement. Vous pouvez annuler votre abonnement à tout moment depuis les paramètres.",
    },
    {
        q: "Est-ce que ça fonctionne si je n'ai pas de photos produit ?",
        a: "Oui. Notre IA trouve automatiquement les photos de vos produits grâce aux codes-barres et aux noms. Pour les marques connues, le taux de réussite dépasse 95%.",
    },
    {
        q: "Comment Two-Step m'apporte des clients ?",
        a: "Vos produits apparaissent dans l'app Two-Step, sur Google Shopping et Google Maps. Les consommateurs qui cherchent un produit près de chez eux voient votre boutique et viennent directement.",
    },
    {
        q: "Comment je mets à jour mon stock ?",
        a: "Trois options selon vos habitudes : le Récap du jour (2 minutes le soir), les boutons +/- sur chaque produit, ou un nouvel import CSV pour tout recaler. Si vous avez un POS compatible, c'est même automatique.",
    },
];

/* ── Components ──────────────────────────────────────────────────── */

function CheckIcon({ className }: { className?: string }) {
    return (
        <svg className={className || "size-5 text-brand-secondary"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
        <motion.div {...slideUp(delay)} className="border-b border-secondary last:border-b-0">
            <button
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between py-5 text-left"
            >
                <span className="text-[15px] font-semibold text-primary">{q}</span>
                <span
                    className="ml-4 shrink-0 text-[18px] text-primary/50 transition-transform duration-200"
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
                <p className="pb-5 text-[14px] leading-relaxed text-tertiary">{a}</p>
            </motion.div>
        </motion.div>
    );
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function TarifsScreen() {
    const tableRef = useRef<HTMLDivElement>(null);

    return (
        <LenisProvider>
            <Nav />
            <main id="tarifs" className="bg-white">

                {/* ── Hero ── */}
                <section className="px-6 pt-28 pb-10 text-center md:px-12 md:pt-36 md:pb-14">
                    <motion.div {...slideUp(0)}>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-3.5 py-1 text-[12px] font-semibold text-brand-secondary">
                            Plus vous arrivez tôt, moins vous payez
                        </span>
                    </motion.div>
                    <motion.h1
                        {...slideUp(0.05)}
                        className="mt-5 text-[32px] font-black leading-tight tracking-tight text-primary md:text-[48px]"
                    >
                        Un prix simple.<br />
                        <span className="text-brand-secondary">Un ROI immédiat.</span>
                    </motion.h1>
                    <motion.p
                        {...slideUp(0.1)}
                        className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-tertiary md:text-[17px]"
                    >
                        Un seul client ramené en boutique rembourse votre mois. Essayez gratuitement, sans carte bancaire.
                    </motion.p>
                </section>

                {/* ── Pricing Cards ── */}
                <section className="mx-auto max-w-[1100px] px-6 pb-16 md:px-12 md:pb-20">
                    <div className="grid gap-8 md:grid-cols-3 items-start">
                        {tiers.map((tier, i) => {
                            return (
                                <motion.div
                                    key={tier.name}
                                    {...slideUp(stagger(i, 0.12))}
                                    className={[
                                        "relative flex flex-col rounded-2xl border",
                                        tier.highlighted
                                            ? "border-brand shadow-[0_4px_24px_rgba(66,104,255,0.15)] p-7 pt-10 md:p-8 md:pt-11"
                                            : "border-secondary shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-7 md:p-8",
                                    ].join(" ")}
                                >
                                    {/* Badge */}
                                    {tier.badge && (
                                        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-solid px-4 py-1.5 text-[11px] font-bold tracking-wide uppercase text-white">
                                            {tier.badge}
                                        </span>
                                    )}

                                    {/* Name + description */}
                                    <h3 className="text-[18px] font-bold text-primary">{tier.name}</h3>
                                    <p className="mt-2 min-h-[40px] text-[13px] leading-relaxed text-tertiary">{tier.description}</p>

                                    {/* Price */}
                                    <div className="mt-5 flex items-baseline gap-1.5">
                                        <span className="text-[40px] font-black tracking-tight text-primary">{tier.price}</span>
                                        {tier.priceDetail && (
                                            <span className="text-[14px] text-quaternary">{tier.priceDetail}</span>
                                        )}
                                    </div>

                                    {/* CTA */}
                                    <Link
                                        href={tier.href}
                                        className={[
                                            "mt-6 block rounded-xl py-3.5 text-center text-[14px] font-bold transition duration-100 ease-linear no-underline",
                                            tier.highlighted
                                                ? "bg-brand-solid text-white hover:bg-brand-solid_hover"
                                                : "border border-secondary text-primary hover:bg-secondary",
                                        ].join(" ")}
                                    >
                                        {tier.cta}
                                    </Link>

                                    {/* Divider */}
                                    <div className="my-6 h-px bg-secondary" />

                                    {/* Features */}
                                    <ul className="flex-1 space-y-3">
                                        {tier.features.map((f) => (
                                            <li key={f.text} className="flex items-start gap-2.5 text-[14px] leading-snug text-secondary">
                                                <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-secondary" />
                                                <span>{f.text}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>

                {/* ── Trust Signals ── */}
                <div className="flex flex-wrap items-center justify-center gap-6 px-6 pb-16 md:gap-10 md:pb-20">
                    {[
                        { text: "Sans engagement", path: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
                        { text: "Sans carte bancaire", path: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
                        { text: "Setup en 10 minutes", path: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
                        { text: "Annulable à tout moment", path: "M6 18L18 6M6 6l12 12" },
                    ].map((s) => (
                        <div key={s.text} className="flex items-center gap-2">
                            <svg className="size-5 shrink-0 text-brand-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={s.path} />
                            </svg>
                            <span className="text-[13px] font-medium text-tertiary">{s.text}</span>
                        </div>
                    ))}
                </div>

                {/* ── Comparison Table ── */}
                <section ref={tableRef} className="mx-auto max-w-[900px] px-6 pb-20 md:px-12 md:pb-28">
                    <h2 className="mb-8 text-center text-[24px] font-bold text-primary md:text-[28px]">
                        Comparer les plans
                    </h2>

                    <div className="overflow-x-auto rounded-xl border border-secondary">
                        <table className="w-full text-left text-[14px]">
                            <thead>
                                <tr className="border-b border-secondary bg-secondary">
                                    <th className="px-5 py-4 font-semibold text-primary">Fonctionnalité</th>
                                    <th className="px-5 py-4 text-center font-semibold text-brand-secondary">Pionnier — 19€</th>
                                    <th className="px-5 py-4 text-center font-semibold text-primary">Early — 29€</th>
                                    <th className="px-5 py-4 text-center font-semibold text-primary">Standard — 39€</th>
                                </tr>
                            </thead>
                            <tbody>
                                {comparisons.map((row, i) => (
                                    <tr key={row.feature} className={i < comparisons.length - 1 ? "border-b border-secondary" : ""}>
                                        <td className="px-5 py-3.5 text-secondary">{row.feature}</td>
                                        {[row.free, row.pro, row.business].map((val, j) => (
                                            <td key={j} className="px-5 py-3.5 text-center">
                                                {val === true ? <CheckIcon className="mx-auto size-4 text-brand-secondary" /> :
                                                 val === false ? <XIcon className="mx-auto size-4 text-[#D1D5DB]" /> :
                                                 <span className="text-[13px] text-tertiary">{val}</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ── FAQ ── */}
                <section className="mx-auto max-w-[640px] px-6 pb-20 md:px-12 md:pb-28">
                    <motion.h2
                        {...slideUp(0)}
                        className="text-center text-[24px] font-bold text-primary md:text-[28px]"
                    >
                        Questions fréquentes
                    </motion.h2>

                    <div className="mt-8">
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
                        2 mois gratuits. Sans engagement. Tarif verrouillé à vie.
                    </p>
                    <div className="mt-6">
                        <Link href="/onboarding" className="inline-block rounded-xl bg-brand-solid px-7 py-3.5 text-[14px] font-bold text-white no-underline transition-colors hover:bg-brand-solid_hover">
                            Commencer gratuitement →
                        </Link>
                    </div>
                </div>
            </section>

            <Footer />
        </LenisProvider>
    );
}

"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import Image from "next/image";

/* ── Animated arrow/line connector ── */
function FlowArrow({ delay = 0 }: { delay?: number }) {
    return (
        <div className="flex items-center justify-center px-1 md:px-3">
            <svg width="48" height="24" viewBox="0 0 48 24" fill="none" className="shrink-0">
                {/* Line */}
                <motion.line
                    x1="0" y1="12" x2="38" y2="12"
                    stroke="#D0D5E1"
                    strokeWidth="2"
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay }}
                    viewport={{ once: true }}
                />
                {/* Arrow head */}
                <motion.path
                    d="M36 6 L44 12 L36 18"
                    stroke="#4268FF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: delay + 0.5 }}
                    viewport={{ once: true }}
                />
                {/* Animated dot traveling along the line */}
                <motion.circle
                    r="3"
                    fill="#4268FF"
                    initial={{ cx: 0, cy: 12, opacity: 0 }}
                    whileInView={{ cx: [0, 44], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.5, delay: delay + 0.8, repeat: Infinity, repeatDelay: 3 }}
                    viewport={{ once: true }}
                />
            </svg>
        </div>
    );
}

/* ── Column card ── */
function SchemaColumn({
    title,
    items,
    color,
    delay,
    isCenter,
}: {
    title: string;
    items: { icon?: string; label: string; sub?: string }[];
    color: string;
    delay: number;
    isCenter?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: "-10%" });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay }}
            className={`flex flex-col items-center gap-3 ${isCenter ? "min-w-[180px]" : "min-w-[140px]"}`}
        >
            {/* Title badge */}
            <div
                className="rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: color }}
            >
                {title}
            </div>

            {/* Items */}
            <div className={`flex flex-col gap-2 w-full ${isCenter ? "items-center" : ""}`}>
                {items.map((item) => (
                    <motion.div
                        key={item.label}
                        initial={{ opacity: 0, x: -8 }}
                        animate={inView ? { opacity: 1, x: 0 } : {}}
                        transition={{ duration: 0.3, delay: delay + 0.3 }}
                        className={`flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 shadow-sm border border-[#E8ECF4] ${isCenter ? "w-full justify-center" : ""}`}
                    >
                        {item.icon && (
                            <span className="text-base">{item.icon}</span>
                        )}
                        <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-primary leading-tight truncate">{item.label}</p>
                            {item.sub && (
                                <p className="text-[10px] text-quaternary leading-tight">{item.sub}</p>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

/* ── POS logos grid ── */
function POSLogos({ delay }: { delay: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: "-10%" });

    const posystems = [
        { name: "Square", color: "#000000", letter: "□", comingSoon: false },
        { name: "Shopify", color: "#96BF48", letter: "S", comingSoon: false },
        { name: "Lightspeed", color: "#E4451E", letter: "L", comingSoon: false },
        { name: "Zettle", color: "#0070BA", letter: "Z", comingSoon: false },
        { name: "Fastmag", color: "#FF6B00", letter: "F", comingSoon: true },
        { name: "Clictill", color: "#2ABFBF", letter: "C", comingSoon: true },
    ];

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay }}
            className="flex flex-col items-center gap-3 min-w-[140px]"
        >
            <div className="rounded-full bg-primary-solid px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
                Caisses (POS)
            </div>

            <div className="grid grid-cols-2 gap-2">
                {posystems.map((pos, i) => (
                    <motion.div
                        key={pos.name}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={inView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ duration: 0.3, delay: delay + 0.1 * i }}
                        className={`flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-2 shadow-sm border ${pos.comingSoon ? "border-dashed border-[#D1D5DB] opacity-50" : "border-[#E8ECF4]"}`}
                    >
                        <div
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white"
                            style={{ backgroundColor: pos.color }}
                        >
                            {pos.letter}
                        </div>
                        <span className="text-[11px] font-medium text-primary">{pos.name}</span>
                        {pos.comingSoon && (
                            <span className="ml-auto text-[8px] font-semibold text-[#92400E]">bientôt</span>
                        )}
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

/* ── Center hub (Two-Step) ── */
function CenterHub({ delay }: { delay: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: "-10%" });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, delay }}
            className="flex flex-col items-center gap-3 min-w-[180px]"
        >
            {/* Logo hub */}
            <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-brand-solid shadow-lg shadow-brand-solid/25">
                <span className="text-[18px] font-black text-white tracking-tight">TS</span>
                {/* Pulse ring */}
                <motion.div
                    className="absolute inset-0 rounded-2xl border-2 border-brand"
                    animate={{ scale: [1, 1.3], opacity: [0.5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                />
            </div>
            <p className="text-[14px] font-bold text-primary">Two-Step</p>
            <p className="text-[11px] text-quaternary text-center max-w-[160px]">
                Enrichit, catégorise, met en ligne
            </p>

            {/* Features */}
            <div className="flex flex-col gap-1.5 w-full">
                {[
                    { icon: "🖼️", label: "Photos IA" },
                    { icon: "🏷️", label: "Catégorisation auto" },
                    { icon: "📦", label: "Stock temps réel" },
                    { icon: "📐", label: "Tailles extraites" },
                ].map((f) => (
                    <motion.div
                        key={f.label}
                        initial={{ opacity: 0 }}
                        animate={inView ? { opacity: 1 } : {}}
                        transition={{ duration: 0.3, delay: delay + 0.5 }}
                        className="flex items-center gap-2 rounded-lg bg-[#EEF2FF] px-3 py-1.5"
                    >
                        <span className="text-[12px]">{f.icon}</span>
                        <span className="text-[11px] font-medium text-brand-secondary">{f.label}</span>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

/* ── Main schema ── */
export function HeroSchema() {
    return (
        <div className="w-full overflow-x-auto scrollbar-hide py-4">
            <div className="flex items-start justify-center gap-0 min-w-[900px] px-6">
                {/* Col 1: Fournisseurs */}
                <SchemaColumn
                    title="Fournisseurs"
                    color="#8B6F47"
                    delay={0}
                    items={[
                        { icon: "📋", label: "Catalogues", sub: "Données produit" },
                        { icon: "🧾", label: "Factures", sub: "Références articles" },
                        { icon: "📊", label: "Tarifs", sub: "Prix fournisseur" },
                    ]}
                />

                <FlowArrow delay={0.3} />

                {/* Col 2: POS */}
                <POSLogos delay={0.5} />

                <FlowArrow delay={0.8} />

                {/* Col 3: Two-Step (center) */}
                <CenterHub delay={1.0} />

                <FlowArrow delay={1.3} />

                {/* Col 4: Diffusion */}
                <SchemaColumn
                    title="Diffusion"
                    color="#12B76A"
                    delay={1.5}
                    items={[
                        { icon: "📱", label: "App Two-Step", sub: "Découverte locale" },
                        { icon: "🔍", label: "Google Merchant", sub: "Visibilité Search" },
                        { icon: "📍", label: "Google Maps", sub: "Local Inventory Ads" },
                    ]}
                />
            </div>
        </div>
    );
}

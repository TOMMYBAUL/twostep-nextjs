"use client";

import { motion, AnimatePresence, useInView } from "motion/react";
import { useRef, useState, useEffect } from "react";
import { SPRING, slideUp } from "@/lib/motion";

const steps = [
    {
        num: 1,
        title: "Cherche ton produit",
        desc: "Par catégorie, marque, nom ou directement sur la carte. Filtre par taille, prix, distance.",
        screen: "Écran recherche",
        numBg: "bg-[#4268FF]",
        numText: "text-white",
    },
    {
        num: 2,
        title: "Vérifie le stock en temps réel",
        desc: 'Les boutiques connectent leur caisse. Tu vois ce qui est vraiment en rayon, maintenant — pas "en théorie".',
        screen: "Écran fiche produit",
        numBg: "bg-[#1A1A1A]",
        numText: "text-white",
    },
    {
        num: 3,
        title: 'Vas-y en 2 minutes',
        desc: "C'est à côté, c'est ouvert, c'est en stock. Préviens le marchand avec \"J'arrive\" et récupère ton produit.",
        screen: "Écran J'arrive",
        numBg: "bg-[#1A1A1A]",
        numText: "text-white",
    },
];

function StepRow({
    step,
    index,
    onActivate,
}: {
    step: (typeof steps)[0];
    index: number;
    onActivate: (i: number) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { margin: "-40% 0px -40% 0px" });

    useEffect(() => {
        if (inView) onActivate(index);
    }, [inView, index, onActivate]);

    return (
        <motion.div
            ref={ref}
            {...slideUp(index * 0.1)}
            className="flex gap-5 py-10 border-l-[3px] pl-6 transition-all duration-200"
            style={{
                borderLeftColor: inView ? "#4268FF" : "transparent",
                opacity: inView ? 1 : 0.4,
            }}
        >
            <div
                className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${step.numBg} ${step.numText}`}
            >
                {step.num}
            </div>
            <div>
                <h3 className="text-[17px] font-bold tracking-tight text-[#1A1A1A] mb-2 leading-snug">
                    {step.title}
                </h3>
                <p className="text-[14px] text-[#6B7280] leading-relaxed m-0">
                    {step.desc}
                </p>
            </div>
        </motion.div>
    );
}

function MobileStep({ step, index }: { step: (typeof steps)[0]; index: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 32 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ ...SPRING, delay: index * 0.1 }}
            className="flex flex-col gap-4"
        >
            {/* Mobile screenshot placeholder */}
            <div className="h-[180px] bg-gray-100 rounded-2xl flex items-center justify-center">
                <span className="text-sm text-gray-400 font-medium">{step.screen}</span>
            </div>

            <div className="flex gap-4">
                <div
                    className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${step.numBg} ${step.numText}`}
                >
                    {step.num}
                </div>
                <div>
                    <h3 className="text-[17px] font-bold tracking-tight text-[#1A1A1A] mb-1.5 leading-snug">
                        {step.title}
                    </h3>
                    <p className="text-[14px] text-[#6B7280] leading-relaxed m-0">
                        {step.desc}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}

export function How() {
    const headerRef = useRef<HTMLDivElement>(null);
    const headerInView = useInView(headerRef, { once: true, margin: "-8%" });
    const [activeStep, setActiveStep] = useState(0);

    return (
        <section
            id="comment"
            className="bg-white px-6 py-20 md:px-12 md:py-[120px]"
        >
            <div className="max-w-[1100px] mx-auto">
                {/* Header */}
                <motion.div
                    ref={headerRef}
                    initial={{ opacity: 0, y: 32 }}
                    animate={headerInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ ...SPRING }}
                    className="mb-14"
                >
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#4268FF] mb-4">
                        COMMENT ÇA MARCHE
                    </p>
                    <h2 className="text-[22px] md:text-[36px] font-[900] tracking-tight text-[#1A1A1A] m-0">
                        En 3 étapes
                    </h2>
                </motion.div>

                {/* Desktop layout */}
                <div className="hidden md:grid md:grid-cols-2 md:gap-16 md:items-start">
                    {/* Sticky phone mockup */}
                    <div className="sticky top-20">
                        <div className="w-[280px] h-[500px] rounded-[32px] border-2 border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                            <AnimatePresence mode="wait">
                                <motion.span
                                    key={activeStep}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="text-sm text-gray-400 font-medium px-4 text-center"
                                >
                                    📱 {steps[activeStep].screen}
                                </motion.span>
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Steps */}
                    <div className="flex flex-col divide-y divide-gray-100">
                        {steps.map((step, i) => (
                            <StepRow
                                key={step.num}
                                step={step}
                                index={i}
                                onActivate={setActiveStep}
                            />
                        ))}
                    </div>
                </div>

                {/* Mobile layout */}
                <div className="flex flex-col gap-10 md:hidden">
                    {steps.map((step, i) => (
                        <MobileStep key={step.num} step={step} index={i} />
                    ))}
                </div>
            </div>
        </section>
    );
}

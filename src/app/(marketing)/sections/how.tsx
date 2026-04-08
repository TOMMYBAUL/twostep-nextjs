"use client";

import { motion, AnimatePresence, useInView } from "motion/react";
import { useRef, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { SPRING, slideUp } from "@/lib/motion";

const steps = [
    {
        num: 1,
        title: "Cherche ton produit",
        desc: "Par catégorie, marque, nom ou directement sur la carte. Filtre par taille, prix, distance.",
        media: { type: "image" as const, src: "/images/how-it-works/carte.jpeg" },
    },
    {
        num: 2,
        title: "Réserve en un clic",
        desc: "Tu vois ce qui est vraiment en rayon. Clique sur \"J'arrive\" — le marchand est prévenu instantanément.",
        media: { type: "video" as const, src: "/images/how-it-works/transition.mp4", poster: "/images/how-it-works/jarrive.jpeg" },
    },
    {
        num: 3,
        title: "Vas-y en 2 minutes",
        desc: "C'est à côté, c'est ouvert, c'est en stock. L'itinéraire s'ouvre, tu récupères ton produit.",
        media: { type: "image" as const, src: "/images/how-it-works/google-maps.jpeg" },
    },
];

/* ── Phone mockup with media ── */
function PhoneMockup({ step, isActive }: { step: (typeof steps)[number]; isActive: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!videoRef.current) return;
        if (isActive) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
        } else {
            videoRef.current.pause();
        }
    }, [isActive]);

    return (
        <div className="relative mx-auto w-[280px]">
            {/* Phone frame */}
            <div className="relative overflow-hidden rounded-[40px] border-[6px] border-[#1A1A1A] bg-[#1A1A1A] shadow-2xl">
                {/* Notch */}
                <div className="absolute left-1/2 top-0 z-20 h-[26px] w-[120px] -translate-x-1/2 rounded-b-2xl bg-[#1A1A1A]" />

                {/* Screen */}
                <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[34px] bg-white">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step.num}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className="absolute inset-0"
                        >
                            {step.media.type === "image" ? (
                                <Image
                                    src={step.media.src}
                                    alt={step.title}
                                    fill
                                    className="object-cover object-top"
                                    sizes="280px"
                                />
                            ) : (
                                <video
                                    ref={videoRef}
                                    src={step.media.src}
                                    poster={step.media.poster}
                                    muted
                                    playsInline
                                    className="h-full w-full object-cover object-top"
                                />
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Bottom bar indicator */}
            <div className="absolute bottom-2 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-white/30" />
        </div>
    );
}

/* ── Desktop step row ── */
function StepRow({
    step,
    index,
    onActivate,
}: {
    step: (typeof steps)[number];
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
            className="flex gap-5 border-l-[3px] py-10 pl-6 transition-all duration-200"
            style={{
                borderLeftColor: inView ? "#4268FF" : "transparent",
                opacity: inView ? 1 : 0.4,
            }}
        >
            <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                    step.num === 1 ? "bg-brand-solid text-white" : "bg-[#1A1A1A] text-white"
                }`}
            >
                {step.num}
            </div>
            <div>
                <h3 className="mb-2 text-[17px] font-bold leading-snug tracking-tight text-primary">
                    {step.title}
                </h3>
                <p className="m-0 text-[14px] leading-relaxed text-tertiary">
                    {step.desc}
                </p>
            </div>
        </motion.div>
    );
}

/* ── Mobile step ── */
function MobileStep({ step, index }: { step: (typeof steps)[number]; index: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoInView = useInView(ref, { margin: "-20% 0px -20% 0px" });

    useEffect(() => {
        if (!videoRef.current) return;
        if (videoInView) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
        } else {
            videoRef.current.pause();
        }
    }, [videoInView]);

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 32 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ ...SPRING, delay: index * 0.1 }}
            className="flex flex-col gap-4"
        >
            {/* Mobile screenshot in phone frame */}
            <div className="relative mx-auto w-[220px]">
                <div className="relative overflow-hidden rounded-[32px] border-[5px] border-[#1A1A1A] bg-[#1A1A1A] shadow-xl">
                    <div className="absolute left-1/2 top-0 z-20 h-[22px] w-[100px] -translate-x-1/2 rounded-b-xl bg-[#1A1A1A]" />
                    <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[27px] bg-white">
                        {step.media.type === "image" ? (
                            <Image
                                src={step.media.src}
                                alt={step.title}
                                fill
                                className="object-cover object-top"
                                sizes="220px"
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                src={step.media.src}
                                poster={step.media.poster}
                                muted
                                playsInline
                                className="h-full w-full object-cover object-top"
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="flex gap-4">
                <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                        step.num === 1 ? "bg-brand-solid text-white" : "bg-[#1A1A1A] text-white"
                    }`}
                >
                    {step.num}
                </div>
                <div>
                    <h3 className="mb-1.5 text-[17px] font-bold leading-snug tracking-tight text-primary">
                        {step.title}
                    </h3>
                    <p className="m-0 text-[14px] leading-relaxed text-tertiary">
                        {step.desc}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}

/* ── Main section ── */
export function How() {
    const headerRef = useRef<HTMLDivElement>(null);
    const headerInView = useInView(headerRef, { once: true, margin: "-8%" });
    const [activeStep, setActiveStep] = useState(0);
    const handleActivate = useCallback((i: number) => setActiveStep(i), []);

    return (
        <section
            id="comment"
            className="bg-white px-6 py-20 md:px-12 md:py-[120px]"
        >
            <div className="mx-auto max-w-[1100px]">
                {/* Header */}
                <motion.div
                    ref={headerRef}
                    initial={{ opacity: 0, y: 32 }}
                    animate={headerInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ ...SPRING }}
                    className="mb-14"
                >
                    <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-secondary">
                        COMMENT ÇA MARCHE
                    </p>
                    <h2 className="m-0 text-[22px] font-[900] tracking-tight text-primary md:text-[36px]">
                        En 3 étapes
                    </h2>
                </motion.div>

                {/* Desktop layout */}
                <div className="hidden md:grid md:grid-cols-2 md:items-start md:gap-16">
                    {/* Sticky phone mockup */}
                    <div className="sticky top-20">
                        <PhoneMockup step={steps[activeStep]} isActive={true} />
                    </div>

                    {/* Steps */}
                    <div className="flex flex-col divide-y divide-gray-100">
                        {steps.map((step, i) => (
                            <StepRow
                                key={step.num}
                                step={step}
                                index={i}
                                onActivate={handleActivate}
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

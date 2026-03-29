"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const SPLASH_DURATION = 1400;
const STORAGE_KEY = "onboarding_completed";

/* ═══════════════════════════════════════════════════════
   Shared UI
   ═══════════════════════════════════════════════════════ */

function Dots({ current }: { current: number }) {
    return (
        <div className="flex items-center justify-center gap-2 py-4">
            {[0, 1, 2, 3].map((i) => (
                <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === current
                            ? "w-5 bg-[#4268FF]"
                            : "w-1.5 bg-[#4268FF]/20"
                    }`}
                />
            ))}
        </div>
    );
}

function ScreenLayout({
    children,
    dots,
}: {
    children: React.ReactNode;
    dots: number;
}) {
    return (
        <div className="flex h-dvh flex-col bg-white">
            {children}
            <Dots current={dots} />
        </div>
    );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full rounded-xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition duration-150 active:scale-[0.98] active:opacity-90"
        >
            {children}
        </button>
    );
}

function OutlineButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full rounded-xl border-2 border-[#4268FF] py-3 text-sm font-bold text-[#4268FF] transition duration-150 active:bg-[#4268FF]/5"
        >
            {children}
        </button>
    );
}

function TextBlock({
    title,
    subtitle,
    body,
    hint,
}: {
    title: string;
    subtitle: string;
    body: string;
    hint?: string;
}) {
    return (
        <div className="px-8 text-center">
            <h1 className="font-display text-[2rem] font-bold leading-tight text-[#1A1F36]">
                {title}
            </h1>
            <p className="font-display text-[1.4rem] font-bold text-[#4268FF]">
                {subtitle}
            </p>
            <p className="mx-auto mt-3 max-w-[300px] text-sm leading-relaxed text-[#8E96B0]">
                {body}
            </p>
            {hint && <p className="mt-2 text-xs text-[#8E96B0]/60">{hint}</p>}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   Illustrations (inline SVG) — updated to Minuit Électrique
   ═══════════════════════════════════════════════════════ */

function MapIllustration() {
    return (
        <div className="mx-auto size-44">
            <svg viewBox="0 0 240 240" fill="none" className="h-full w-full">
                <circle cx="120" cy="120" r="116" stroke="#D5D9E8" strokeWidth="3" fill="none" />
                <defs>
                    <clipPath id="mc">
                        <circle cx="120" cy="120" r="114" />
                    </clipPath>
                </defs>
                <g clipPath="url(#mc)">
                    <rect width="240" height="240" fill="#E8EAF2" />
                    <path d="M0 72h240M0 156h240" stroke="#fff" strokeWidth="13" />
                    <path d="M72 0v240M168 0v240" stroke="#fff" strokeWidth="13" />
                    <path d="M120 20v200" stroke="#fff" strokeWidth="9" opacity="0.6" />
                    <path d="M20 120h200" stroke="#fff" strokeWidth="9" opacity="0.5" />
                    <rect x="80" y="80" width="32" height="68" rx="4" fill="#D5D9E8" />
                    <rect x="136" y="80" width="24" height="42" rx="4" fill="#D5D9E8" />
                    <rect x="80" y="164" width="50" height="30" rx="4" fill="#D5D9E8" />
                    {[
                        [58, 40],
                        [170, 38],
                        [42, 140],
                        [185, 155],
                    ].map(([px, py], i) => (
                        <g key={`op${i}`} transform={`translate(${px},${py})`}>
                            <ellipse cx="11" cy="22" rx="6" ry="3" fill="#00000015" />
                            <path
                                d="M11 0C5 0 0 5 0 11c0 8.5 11 20 11 20s11-11.5 11-20C22 5 17 0 11 0z"
                                fill="#4268FF"
                            />
                            <circle cx="11" cy="10" r="4.5" fill="#fff" />
                        </g>
                    ))}
                    {[
                        [102, 42],
                        [150, 138],
                    ].map(([px, py], i) => (
                        <g key={`sp${i}`} transform={`translate(${px},${py})`}>
                            <ellipse cx="9" cy="18" rx="5" ry="2.5" fill="#00000012" />
                            <path
                                d="M9 0C4 0 0 4 0 9c0 7 9 16 9 16s9-9 9-16C18 4 14 0 9 0z"
                                fill="#8E96B0"
                            />
                            <circle cx="9" cy="8" r="3.5" fill="#fff" />
                        </g>
                    ))}
                    <circle cx="120" cy="120" r="12" fill="#4268FF" opacity="0.15" />
                    <circle cx="120" cy="120" r="6" fill="#4268FF" />
                    <circle cx="120" cy="120" r="2.5" fill="#fff" />
                </g>
            </svg>
        </div>
    );
}

function PrivacyIllustration() {
    return (
        <div className="mx-auto size-44">
            <svg viewBox="0 0 240 240" fill="none" className="h-full w-full">
                <circle cx="120" cy="120" r="116" stroke="#D5D9E8" strokeWidth="3" fill="none" />
                <circle cx="120" cy="120" r="114" fill="#E8EAF2" />
                <path
                    d="M120 40 L170 65 L170 130 C170 165 145 190 120 200 C95 190 70 165 70 130 L70 65 Z"
                    fill="#4268FF"
                    opacity="0.9"
                />
                <path
                    d="M120 50 L162 72 L162 128 C162 158 141 180 120 189 C99 180 78 158 78 128 L78 72 Z"
                    fill="#4268FF"
                />
                <rect x="103" y="115" width="34" height="28" rx="4" fill="white" />
                <path
                    d="M109 115 L109 105 C109 97 114 92 120 92 C126 92 131 97 131 105 L131 115"
                    stroke="white"
                    strokeWidth="5"
                    fill="none"
                    strokeLinecap="round"
                />
                <circle cx="120" cy="126" r="4" fill="#4268FF" />
                <rect x="118.5" y="128" width="3" height="6" rx="1.5" fill="#4268FF" />
                {[
                    [50, 50], [185, 55], [40, 160], [195, 165], [55, 105], [185, 110],
                ].map(([px, py], i) => (
                    <circle key={i} cx={px} cy={py} r={4 + (i % 3)} fill="#4268FF" opacity={0.1 + (i % 3) * 0.05} />
                ))}
            </svg>
        </div>
    );
}

function ReadyIllustration() {
    return (
        <div className="mx-auto size-44">
            <svg viewBox="0 0 240 240" fill="none" className="h-full w-full">
                <circle cx="120" cy="120" r="116" stroke="#D5D9E8" strokeWidth="3" fill="none" />
                <circle cx="120" cy="120" r="114" fill="#E8EAF2" />
                <rect x="80" y="90" width="80" height="85" rx="8" fill="#4268FF" />
                <rect x="88" y="98" width="64" height="69" rx="4" fill="white" opacity="0.9" />
                <path
                    d="M100 90 L100 72 C100 60 109 52 120 52 C131 52 140 60 140 72 L140 90"
                    stroke="#4268FF"
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                />
                <path
                    d="M104 130 L115 142 L140 115"
                    stroke="#4268FF"
                    strokeWidth="5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {[
                    [55, 65, 6], [175, 60, 5], [50, 160, 4], [185, 155, 6],
                    [65, 110, 3], [175, 105, 4], [120, 195, 3],
                ].map(([px, py, r], i) => (
                    <circle key={i} cx={px} cy={py} r={r} fill="#4268FF" opacity={0.15 + (i % 3) * 0.05} />
                ))}
                {[
                    [60, 80], [170, 75], [55, 145], [180, 140],
                ].map(([px, py], i) => (
                    <g key={`s${i}`} transform={`translate(${px},${py})`}>
                        <path d="M0 -5 L1.5 -1.5 L5 0 L1.5 1.5 L0 5 L-1.5 1.5 L-5 0 L-1.5 -1.5Z" fill="#4268FF" opacity="0.3" />
                    </g>
                ))}
            </svg>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   Screen 0 — Splash
   ═══════════════════════════════════════════════════════ */

function SplashScreen() {
    return (
        <div className="flex h-dvh flex-col items-center justify-center bg-white">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
            >
                <Image
                    src="/logo-icon.webp"
                    alt="Two-Step"
                    width={120}
                    height={120}
                    priority
                />
            </motion.div>
            <div className="absolute inset-x-0 bottom-0">
                <Dots current={0} />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   Screen 1 — Localisation
   ═══════════════════════════════════════════════════════ */

function LocationScreen({ onNext }: { onNext: () => void }) {
    const [showAddressInput, setShowAddressInput] = useState(false);
    const [address, setAddress] = useState("");

    const requestLocation = () => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(() => onNext(), () => onNext(), {
                enableHighAccuracy: true,
                timeout: 8000,
            });
        } else {
            onNext();
        }
    };

    const handleAddressSubmit = () => {
        if (address.trim()) {
            onNext();
        }
    };

    return (
        <ScreenLayout dots={1}>
            <div className="flex flex-1 items-end justify-center pb-3 pt-6">
                <MapIllustration />
            </div>
            <TextBlock
                title="Bonjour !"
                subtitle="Où es-tu ?"
                body="Indique ta position pour découvrir les boutiques et les bons plans près de chez toi."
                hint="Tu peux modifier ce paramètre à tout moment."
            />
            <div className="mt-auto space-y-2 px-6 pb-2 pt-4">
                <PrimaryButton onClick={requestLocation}>Activer la localisation</PrimaryButton>

                {showAddressInput ? (
                    <div className="space-y-2">
                        <input
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="Ex : 12 rue du Taur, Toulouse"
                            className="w-full rounded-xl border-2 border-[#4268FF]/30 bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition duration-150 focus:border-[#4268FF]"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && handleAddressSubmit()}
                        />
                        <OutlineButton onClick={handleAddressSubmit}>Valider</OutlineButton>
                    </div>
                ) : (
                    <OutlineButton onClick={() => setShowAddressInput(true)}>
                        Entrer une adresse manuellement
                    </OutlineButton>
                )}
            </div>
        </ScreenLayout>
    );
}

/* ═══════════════════════════════════════════════════════
   Screen 2 — Cookies / Confidentialité
   ═══════════════════════════════════════════════════════ */

function CookiesScreen({ onNext }: { onNext: () => void }) {
    return (
        <ScreenLayout dots={2}>
            <div className="flex flex-1 items-end justify-center pb-3">
                <PrivacyIllustration />
            </div>
            <TextBlock
                title="Tes données,"
                subtitle="ton choix."
                body="On utilise des cookies pour améliorer ton expérience et te montrer les promos qui t'intéressent vraiment."
            />
            <div className="mt-auto space-y-2 px-6 pb-2 pt-4">
                <PrimaryButton onClick={onNext}>Tout accepter</PrimaryButton>
                <PrimaryButton onClick={onNext}>Tout refuser</PrimaryButton>
                <OutlineButton onClick={onNext}>Personnaliser</OutlineButton>
            </div>
        </ScreenLayout>
    );
}

/* ═══════════════════════════════════════════════════════
   Screen 3 — C'est parti
   ═══════════════════════════════════════════════════════ */

function ReadyScreen({ onFinish }: { onFinish: () => void }) {
    return (
        <ScreenLayout dots={3}>
            <div className="flex flex-1 items-end justify-center pb-3 pt-6">
                <ReadyIllustration />
            </div>
            <TextBlock
                title="C'est parti !"
                subtitle="Tout est prêt."
                body="Découvre les boutiques autour de toi, explore leurs produits en temps réel, et sauvegarde tes coups de cœur."
            />
            <div className="mt-auto px-6 pb-2 pt-4">
                <PrimaryButton onClick={onFinish}>Explorer les boutiques</PrimaryButton>
            </div>
        </ScreenLayout>
    );
}

/* ═══════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════ */

export default function OnboardingPage() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (localStorage.getItem(STORAGE_KEY) === "true") {
            router.replace("/discover");
        }
    }, [router]);

    useEffect(() => {
        if (step === 0 && mounted) {
            const timer = setTimeout(() => setStep(1), SPLASH_DURATION);
            return () => clearTimeout(timer);
        }
    }, [step, mounted]);

    const next = useCallback(() => setStep((s) => s + 1), []);

    const finish = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, "true");
        router.push("/discover");
    }, [router]);

    if (!mounted) return null;

    return (
        <div className="relative h-dvh overflow-hidden bg-white">
            <AnimatePresence mode="wait">
                {step === 0 && (
                    <motion.div
                        key="splash"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <SplashScreen />
                    </motion.div>
                )}
                {step === 1 && (
                    <motion.div
                        key="location"
                        initial={{ x: "80%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "-30%", opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                    >
                        <LocationScreen onNext={next} />
                    </motion.div>
                )}
                {step === 2 && (
                    <motion.div
                        key="cookies"
                        initial={{ x: "80%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "-30%", opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                    >
                        <CookiesScreen onNext={next} />
                    </motion.div>
                )}
                {step === 3 && (
                    <motion.div
                        key="ready"
                        initial={{ x: "80%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "-30%", opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                    >
                        <ReadyScreen onFinish={finish} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

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

function Dots({ current, light = false }: { current: number; light?: boolean }) {
    return (
        <div className="flex items-center justify-center gap-2 pb-8 pt-4">
            {[0, 1, 2, 3].map((i) => (
                <div
                    key={i}
                    className={`h-2 rounded-full transition-all duration-300 ${
                        i === current
                            ? light
                                ? "w-6 bg-white"
                                : "w-6 bg-[var(--ts-ochre)]"
                            : light
                              ? "w-2 bg-white/30"
                              : "w-2 bg-[var(--ts-ochre)]/25"
                    }`}
                />
            ))}
        </div>
    );
}

function ScreenLayout({
    children,
    dots,
    topRight,
}: {
    children: React.ReactNode;
    dots: number;
    topRight?: React.ReactNode;
}) {
    return (
        <div className="flex min-h-dvh flex-col bg-[var(--ts-cream)]">
            {topRight && <div className="flex justify-end px-6 pt-4">{topRight}</div>}
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
            className="w-full rounded-2xl bg-[var(--ts-ochre)] py-4 text-base font-bold text-white shadow-sm transition duration-150 active:scale-[0.98] active:opacity-90"
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
            className="w-full rounded-2xl border-2 border-[var(--ts-ochre)] py-3.5 text-base font-bold text-[var(--ts-ochre)] transition duration-150 active:bg-[var(--ts-ochre)]/5"
        >
            {children}
        </button>
    );
}

function TextLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full py-3 text-sm font-semibold text-[var(--ts-ochre)] transition duration-150 active:opacity-70"
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
            <h1
                className="text-[2.5rem] font-bold leading-tight text-[var(--ts-brown)]"
                style={{ fontFamily: "var(--font-fraunces), serif" }}
            >
                {title}
            </h1>
            <p
                className="text-[1.75rem] font-bold text-[var(--ts-ochre)]"
                style={{ fontFamily: "var(--font-fraunces), serif" }}
            >
                {subtitle}
            </p>
            <p className="mx-auto mt-5 max-w-[300px] text-base font-medium leading-relaxed text-[var(--ts-brown)]">
                {body}
            </p>
            {hint && <p className="mt-3 text-sm text-[var(--ts-brown-mid)]/50">{hint}</p>}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   Illustrations (inline SVG)
   ═══════════════════════════════════════════════════════ */

function MapIllustration() {
    return (
        <div className="mx-auto h-56 w-56 sm:h-64 sm:w-64">
            <svg viewBox="0 0 240 240" fill="none" className="h-full w-full">
                <circle cx="120" cy="120" r="116" stroke="#E0D8C8" strokeWidth="3" fill="none" />
                <defs>
                    <clipPath id="mc">
                        <circle cx="120" cy="120" r="114" />
                    </clipPath>
                </defs>
                <g clipPath="url(#mc)">
                    <rect width="240" height="240" fill="#EBE3D3" />
                    {/* Roads */}
                    <path d="M0 72h240M0 156h240" stroke="#fff" strokeWidth="13" />
                    <path d="M72 0v240M168 0v240" stroke="#fff" strokeWidth="13" />
                    <path d="M120 20v200" stroke="#fff" strokeWidth="9" opacity="0.6" />
                    <path d="M20 120h200" stroke="#fff" strokeWidth="9" opacity="0.5" />
                    {/* Blocks */}
                    <rect x="80" y="80" width="32" height="68" rx="4" fill="#DDD5C5" />
                    <rect x="136" y="80" width="24" height="42" rx="4" fill="#DDD5C5" />
                    <rect x="80" y="164" width="50" height="30" rx="4" fill="#DDD5C5" />
                    {/* Ochre map pins */}
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
                                fill="#C8813A"
                            />
                            <circle cx="11" cy="10" r="4.5" fill="#fff" />
                        </g>
                    ))}
                    {/* Sage pins */}
                    {[
                        [102, 42],
                        [150, 138],
                    ].map(([px, py], i) => (
                        <g key={`sp${i}`} transform={`translate(${px},${py})`}>
                            <ellipse cx="9" cy="18" rx="5" ry="2.5" fill="#00000012" />
                            <path
                                d="M9 0C4 0 0 4 0 9c0 7 9 16 9 16s9-9 9-16C18 4 14 0 9 0z"
                                fill="#7A9E7E"
                            />
                            <circle cx="9" cy="8" r="3.5" fill="#fff" />
                        </g>
                    ))}
                    {/* User position blue dot */}
                    <circle cx="120" cy="120" r="12" fill="#4A90D9" opacity="0.15" />
                    <circle cx="120" cy="120" r="6" fill="#4A90D9" />
                    <circle cx="120" cy="120" r="2.5" fill="#fff" />
                </g>
            </svg>
        </div>
    );
}

function CookiesIllustration() {
    /* Deterministic grid of rounded rects — center area left empty for logo */
    const cells = [
        { x: 10, y: 2, w: 30, h: 30, o: 0.07 },
        { x: 48, y: 6, w: 38, h: 26, o: 0.1 },
        { x: 180, y: 2, w: 34, h: 30, o: 0.08 },
        { x: 222, y: 6, w: 30, h: 26, o: 0.12 },
        { x: 6, y: 40, w: 34, h: 34, o: 0.1 },
        { x: 48, y: 44, w: 26, h: 28, o: 0.06 },
        { x: 192, y: 40, w: 28, h: 32, o: 0.09 },
        { x: 228, y: 44, w: 26, h: 28, o: 0.07 },
        { x: 10, y: 82, w: 30, h: 34, o: 0.08 },
        { x: 48, y: 86, w: 34, h: 26, o: 0.11 },
        { x: 188, y: 82, w: 34, h: 30, o: 0.06 },
        { x: 230, y: 86, w: 26, h: 26, o: 0.1 },
        { x: 6, y: 132, w: 38, h: 28, o: 0.09 },
        { x: 52, y: 136, w: 26, h: 26, o: 0.07 },
        { x: 192, y: 132, w: 30, h: 28, o: 0.1 },
        { x: 230, y: 136, w: 26, h: 26, o: 0.06 },
        { x: 10, y: 170, w: 30, h: 32, o: 0.11 },
        { x: 48, y: 174, w: 34, h: 26, o: 0.06 },
        { x: 90, y: 170, w: 26, h: 30, o: 0.08 },
        { x: 160, y: 174, w: 28, h: 26, o: 0.09 },
        { x: 196, y: 170, w: 30, h: 30, o: 0.07 },
        { x: 234, y: 174, w: 24, h: 26, o: 0.1 },
    ];

    return (
        <div className="relative mx-auto h-52 w-64 sm:h-56">
            <svg viewBox="0 0 264 210" fill="none" className="absolute inset-0 h-full w-full">
                {cells.map((c, i) => (
                    <rect
                        key={i}
                        x={c.x}
                        y={c.y}
                        width={c.w}
                        height={c.h}
                        rx={8}
                        fill="#C8813A"
                        opacity={c.o}
                    />
                ))}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-[22px] bg-[var(--ts-ochre)] p-5 shadow-xl sm:p-6">
                    <Image
                        src="/logo-icon.webp"
                        alt="Two-Step"
                        width={68}
                        height={68}
                        className="brightness-0 invert"
                        priority
                    />
                </div>
            </div>
        </div>
    );
}

function NotificationsIllustration() {
    return (
        <div className="mx-auto h-52 w-48 sm:h-60 sm:w-52">
            <svg viewBox="0 0 208 230" fill="none" className="h-full w-full">
                {/* Phone body */}
                <rect x="38" y="26" width="104" height="184" rx="20" fill="#2C2018" />
                <rect x="45" y="36" width="90" height="164" rx="14" fill="white" />
                <rect x="68" y="36" width="44" height="10" rx="5" fill="#2C2018" />
                {/* Notification card 1 — ochre */}
                <rect x="54" y="62" width="72" height="32" rx="8" fill="#FDF8F3" stroke="#C8813A" strokeWidth="1.2" />
                <circle cx="67" cy="78" r="7" fill="#C8813A" opacity="0.15" />
                <rect x="78" y="73" width="38" height="3.5" rx="1.75" fill="#C8813A" opacity="0.4" />
                <rect x="78" y="80" width="26" height="2.5" rx="1.25" fill="#E0D8C8" />
                {/* Notification card 2 — sage */}
                <rect
                    x="54"
                    y="102"
                    width="72"
                    height="32"
                    rx="8"
                    fill="#FDF8F3"
                    stroke="#7A9E7E"
                    strokeWidth="1.2"
                />
                <circle cx="67" cy="118" r="7" fill="#7A9E7E" opacity="0.15" />
                <rect x="78" y="113" width="32" height="3.5" rx="1.75" fill="#7A9E7E" opacity="0.4" />
                <rect x="78" y="120" width="40" height="2.5" rx="1.25" fill="#E0D8C8" />
                {/* Notification card 3 — orange */}
                <rect
                    x="54"
                    y="142"
                    width="72"
                    height="32"
                    rx="8"
                    fill="#FDF8F3"
                    stroke="#E8923A"
                    strokeWidth="1.2"
                />
                <circle cx="67" cy="158" r="7" fill="#E8923A" opacity="0.15" />
                <rect x="78" y="153" width="34" height="3.5" rx="1.75" fill="#E8923A" opacity="0.4" />
                <rect x="78" y="160" width="28" height="2.5" rx="1.25" fill="#E0D8C8" />
                {/* Floating bell circle */}
                <circle cx="156" cy="36" r="24" fill="#C8813A" />
                <path
                    d="M156 22c-6 0-11 5-11 11v6l-3 3v1.5h28V42l-3-3v-6c0-6-5-11-11-11z"
                    fill="#fff"
                />
                <circle cx="156" cy="45" r="3.2" fill="#fff" />
                {/* Red badge */}
                <circle cx="164" cy="16" r="9" fill="#D94F4F" />
                <text x="164" y="20" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">
                    3
                </text>
            </svg>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   Screen 0 — Splash
   ═══════════════════════════════════════════════════════ */

function SplashScreen() {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--ts-ochre)]">
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
                    className="brightness-0 invert"
                    priority
                />
            </motion.div>
            <div className="absolute inset-x-0 bottom-0">
                <Dots current={0} light />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   Screen 1 — Localisation
   ═══════════════════════════════════════════════════════ */

function LocationScreen({ onNext }: { onNext: () => void }) {
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

    return (
        <ScreenLayout dots={1}>
            <div className="flex flex-1 items-end justify-center pb-4 pt-10">
                <MapIllustration />
            </div>
            <TextBlock
                title="Bonjour !"
                subtitle="Où es-tu ?"
                body="Indique ta position pour découvrir les boutiques et les bons plans près de chez toi."
                hint="Tu peux modifier ce paramètre à tout moment."
            />
            <div className="mt-auto px-6 pb-2 pt-6">
                <PrimaryButton onClick={requestLocation}>Activer la localisation</PrimaryButton>
                <TextLink onClick={onNext}>Entrer une adresse manuellement</TextLink>
            </div>
        </ScreenLayout>
    );
}

/* ═══════════════════════════════════════════════════════
   Screen 2 — Cookies / Confidentialité
   ═══════════════════════════════════════════════════════ */

function CookiesScreen({ onNext }: { onNext: () => void }) {
    return (
        <ScreenLayout
            dots={2}
            topRight={
                <button
                    type="button"
                    onClick={onNext}
                    className="py-3 text-sm font-semibold text-[var(--ts-ochre)] transition duration-150 active:opacity-70"
                >
                    Tout refuser
                </button>
            }
        >
            <div className="flex flex-1 items-end justify-center pb-4">
                <CookiesIllustration />
            </div>
            <TextBlock
                title="Tes données,"
                subtitle="ton choix."
                body="On utilise des cookies pour améliorer ton expérience et te montrer les promos qui t'intéressent vraiment."
            />
            <div className="mt-auto space-y-3 px-6 pb-2 pt-6">
                <PrimaryButton onClick={onNext}>Tout accepter</PrimaryButton>
                <OutlineButton onClick={onNext}>Personnaliser</OutlineButton>
            </div>
        </ScreenLayout>
    );
}

/* ═══════════════════════════════════════════════════════
   Screen 3 — Notifications
   ═══════════════════════════════════════════════════════ */

function NotificationsScreen({ onFinish }: { onFinish: () => void }) {
    const handleActivate = async () => {
        try {
            if ("Notification" in window) {
                await Notification.requestPermission();
            }
        } catch {
            /* ignore */
        }
        onFinish();
    };

    return (
        <ScreenLayout dots={3}>
            <div className="flex flex-1 items-end justify-center pb-4 pt-10">
                <NotificationsIllustration />
            </div>
            <TextBlock
                title="Ne rate rien."
                subtitle="Zéro spam, promis."
                body="Reçois une alerte quand un produit que tu aimes est en promo, ou quand ta boutique préférée a du nouveau stock."
                hint="Tu peux modifier ce paramètre à tout moment."
            />
            <div className="mt-auto px-6 pb-2 pt-6">
                <PrimaryButton onClick={handleActivate}>Activer les notifications</PrimaryButton>
                <TextLink onClick={onFinish}>Plus tard</TextLink>
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

    /* Check if onboarding already done */
    useEffect(() => {
        setMounted(true);
        if (localStorage.getItem(STORAGE_KEY) === "true") {
            router.replace("/discover");
        }
    }, [router]);

    /* Auto-advance splash */
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
        <div className="relative min-h-dvh overflow-hidden bg-[var(--ts-cream)]">
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
                        key="notifications"
                        initial={{ x: "80%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "-30%", opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                    >
                        <NotificationsScreen onFinish={finish} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

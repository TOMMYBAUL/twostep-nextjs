"use client";

import { animate, motion, useInView, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

/* ── Boomerang video hook ─────────────────────────────────────────────── */

function useBounceVideo(ref: React.RefObject<HTMLVideoElement | null>) {
    useEffect(() => {
        const v = ref.current;
        if (!v) return;
        let forward = true;
        const STEP = 0.03;
        let raf: number;
        const tick = () => {
            if (!v.duration) { raf = requestAnimationFrame(tick); return; }
            v.currentTime += forward ? STEP : -STEP;
            if (v.currentTime >= v.duration - STEP) forward = false;
            if (v.currentTime <= STEP) forward = true;
            raf = requestAnimationFrame(tick);
        };
        v.pause();
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [ref]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E = [0.22, 1, 0.36, 1] as any;

/* ── Counter ──────────────────────────────────────────────────────────── */

function Counter({ to, inView }: { to: number; inView: boolean }) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!inView) return;
        const ctrl = animate(0, to, {
            duration: 2,
            ease: "easeOut",
            onUpdate: (v) => setVal(Math.round(v)),
        });
        return () => ctrl.stop();
    }, [inView, to]);
    return <>{val}</>;
}

/* ── Floating stat card (Chirpley-style) ─────────────────────────────── */

interface FloatCardProps {
    top?: string | number;
    bottom?: string | number;
    left?: string | number;
    right?: string | number;
    delay?: number;
    floatDuration?: number;
    children: React.ReactNode;
}

function FloatCard({
    top,
    bottom,
    left,
    right,
    delay = 0,
    floatDuration = 4,
    children,
}: FloatCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.72, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: [0, -13, 0] }}
            transition={{
                opacity: { duration: 0.45, delay },
                scale: { duration: 0.6, delay, ease: E },
                y: {
                    duration: floatDuration,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: delay + 0.6,
                },
            }}
            style={{
                position: "absolute",
                top,
                bottom,
                left,
                right,
                background: "#FFFFFF",
                borderRadius: 18,
                padding: "12px 18px",
                boxShadow:
                    "0 8px 32px rgba(44,32,24,0.13), 0 2px 8px rgba(44,32,24,0.06)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                zIndex: 10,
                userSelect: "none",
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </motion.div>
    );
}

/* ── Scrolling marquee ───────────────────────────────────────────────── */

function Marquee() {
    const base =
        "COMMERCE LOCAL  ·  STOCK VISIBLE  ·  TEMPS RÉEL  ·  TOULOUSE  ·  SANS LIVRAISON  ·  SANS E-COMMERCE  ·  ";
    return (
        <div
            style={{ overflow: "hidden", background: "#C8813A", padding: "13px 0" }}
        >
            <motion.div
                animate={{ x: ["0%", "-50%"] }}
                transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
                style={{ display: "inline-flex", whiteSpace: "nowrap" }}
            >
                {[0, 1, 2, 3].map((i) => (
                    <span
                        key={i}
                        style={{
                            color: "#F5EDD6",
                            fontWeight: 700,
                            fontSize: 11,
                            letterSpacing: "0.14em",
                        }}
                    >
                        {base}
                    </span>
                ))}
            </motion.div>
        </div>
    );
}

/* ── Mascot video (boomerang) ────────────────────────────────────────── */

function MascotVideo() {
    const ref = useRef<HTMLVideoElement>(null);
    useBounceVideo(ref);
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.82, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.2, ease: E }}
            style={{ width: "100%", maxWidth: 480, position: "relative" }}
        >
            <video
                ref={ref}
                muted
                playsInline
                preload="auto"
                style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                    filter: "drop-shadow(0 40px 72px rgba(44,32,24,0.18))",
                }}
            >
                <source src="/mascot.mp4" type="video/mp4" />
            </video>
        </motion.div>
    );
}

/* ── Nav ─────────────────────────────────────────────────────────────── */

function Nav() {
    return (
        <motion.nav
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 48px",
                height: 68,
                background: "rgba(245, 237, 214, 0.88)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderBottom: "1px solid rgba(200, 129, 58, 0.1)",
            }}
        >
            <span
                style={{
                    fontSize: 19,
                    fontWeight: 800,
                    color: "#2C2018",
                    letterSpacing: "-0.03em",
                }}
            >
                Two-Step
            </span>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <a
                    href="#comment"
                    style={{
                        padding: "8px 18px",
                        borderRadius: 999,
                        border: "1.5px solid rgba(44,32,24,0.15)",
                        color: "#2C2018",
                        fontWeight: 600,
                        fontSize: 13,
                        textDecoration: "none",
                        letterSpacing: "-0.01em",
                    }}
                >
                    Comment ça marche
                </a>
                <motion.a
                    href="#contact"
                    whileHover={{
                        scale: 1.05,
                        boxShadow: "0 6px 24px rgba(200,129,58,0.35)",
                    }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                        padding: "10px 22px",
                        borderRadius: 999,
                        background: "#C8813A",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 13,
                        textDecoration: "none",
                        letterSpacing: "-0.01em",
                    }}
                >
                    Être contacté →
                </motion.a>
            </div>
        </motion.nav>
    );
}

/* ── Hero ────────────────────────────────────────────────────────────── */

function Hero() {
    const { scrollY } = useScroll();
    const imgY = useTransform(scrollY, [0, 700], [0, -60]);
    const textY = useTransform(scrollY, [0, 700], [0, -25]);

    return (
        <section
            style={{
                minHeight: "100vh",
                background: "#F5EDD6",
                display: "flex",
                alignItems: "center",
                padding: "100px 48px 80px",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* Soft radial glow */}
            <div
                style={{
                    position: "absolute",
                    top: "30%",
                    right: "20%",
                    width: 600,
                    height: 600,
                    borderRadius: "50%",
                    background:
                        "radial-gradient(circle, rgba(200,129,58,0.12) 0%, transparent 70%)",
                    pointerEvents: "none",
                }}
            />

            <div
                style={{
                    maxWidth: 1200,
                    margin: "0 auto",
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 48,
                    alignItems: "center",
                }}
            >
                {/* Left — headline */}
                <motion.div style={{ y: textY }}>
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, delay: 0.1, ease: E }}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 32,
                            padding: "6px 16px",
                            borderRadius: 999,
                            background: "rgba(200, 129, 58, 0.12)",
                            border: "1px solid rgba(200, 129, 58, 0.28)",
                        }}
                    >
                        <motion.span
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: "#C8813A",
                                flexShrink: 0,
                                display: "block",
                            }}
                        />
                        <span
                            style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#C8813A",
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                            }}
                        >
                            Disponible à Toulouse
                        </span>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 36 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.18, ease: E }}
                        style={{
                            fontSize: "clamp(48px, 6.5vw, 92px)",
                            fontWeight: 800,
                            lineHeight: 1.08,
                            letterSpacing: "-0.035em",
                            color: "#2C2018",
                            margin: "0 0 36px",
                        }}
                    >
                        Le produit exact
                        <br />
                        que vous cherchez{" "}
                        <em style={{ fontStyle: "italic", color: "#C8813A" }}>
                            est là,
                        </em>
                        <br />
                        près de chez vous.
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.38, ease: E }}
                        style={{
                            fontSize: "clamp(15px, 1.6vw, 18px)",
                            color: "#6B4F38",
                            lineHeight: 1.65,
                            maxWidth: 430,
                            margin: "0 0 40px",
                        }}
                    >
                        Pas une chaussure — <strong style={{ color: "#2C2018" }}>cette</strong> chaussure, cette marque, cette pointure.
                        Two-Step vous dit en temps réel quelle boutique de votre quartier l'a en stock. Et à combien de minutes.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.46, ease: E }}
                        style={{ display: "flex", gap: 16, alignItems: "center" }}
                    >
                        <motion.a
                            href="#contact"
                            whileHover={{
                                scale: 1.05,
                                boxShadow: "0 12px 40px rgba(200,129,58,0.42)",
                            }}
                            whileTap={{ scale: 0.97 }}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "15px 32px",
                                borderRadius: 999,
                                background: "#C8813A",
                                color: "#fff",
                                fontWeight: 700,
                                fontSize: 15,
                                textDecoration: "none",
                                letterSpacing: "-0.01em",
                            }}
                        >
                            Je veux être pionnier →
                        </motion.a>
                        <a
                            href="#comment"
                            style={{
                                fontSize: 14,
                                color: "#6B4F38",
                                fontWeight: 600,
                                textDecoration: "none",
                                opacity: 0.8,
                            }}
                        >
                            Comment ça marche ↓
                        </a>
                    </motion.div>
                </motion.div>

                {/* Right — illustration + floating cards */}
                <motion.div
                    style={{
                        y: imgY,
                        position: "relative",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    {/* Card — résultat de recherche */}
                    <FloatCard top="2%" left="-8%" delay={0.7} floatDuration={4.3}>
                        <span style={{ fontSize: 20 }}>🔍</span>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#2C2018", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                                Nike Air Max 90 · T.42
                            </div>
                            <div style={{ fontSize: 11, color: "#7A9E7E", fontWeight: 600, marginTop: 2 }}>
                                ✓ En stock · 8 min
                            </div>
                        </div>
                    </FloatCard>

                    {/* Card — distance */}
                    <FloatCard top="18%" right="-10%" delay={0.95} floatDuration={3.7}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(200,129,58,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                            📍
                        </div>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: "#C8813A", letterSpacing: "-0.04em", lineHeight: 1 }}>
                                8 min
                            </div>
                            <div style={{ fontSize: 11, color: "#6B4F38", fontWeight: 500, marginTop: 2 }}>
                                de chez vous
                            </div>
                        </div>
                    </FloatCard>

                    {/* Card — stock */}
                    <FloatCard bottom="10%" left="-6%" delay={1.15} floatDuration={5.1}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: "#2C2018", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
                            🛍️
                        </div>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#2C2018", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                                2 en stock
                            </div>
                            <div style={{ fontSize: 11, color: "#6B4F38", fontWeight: 500, marginTop: 2 }}>
                                Boutique Carmes
                            </div>
                        </div>
                    </FloatCard>

                    {/* Card — live */}
                    <FloatCard bottom="28%" right="-7%" delay={1.35} floatDuration={3.9}>
                        <motion.div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7A9E7E", flexShrink: 0 }}
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#2C2018", letterSpacing: "-0.01em" }}>
                            Temps réel · Toulouse
                        </span>
                    </FloatCard>

                    {/* Mascot video — boomerang */}
                    <MascotVideo />
                </motion.div>
            </div>
        </section>
    );
}

/* ── Statement ───────────────────────────────────────────────────────── */

function Statement() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-12%" });

    return (
        <section
            ref={ref}
            style={{
                background: "#2C2018",
                padding: "120px 48px",
                position: "relative",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "radial-gradient(ellipse at 50% 50%, rgba(200,129,58,0.1) 0%, transparent 65%)",
                    pointerEvents: "none",
                }}
            />
            <div
                style={{
                    maxWidth: 1100,
                    margin: "0 auto",
                    position: "relative",
                }}
            >
                {/* Stats */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1px 1fr",
                        marginBottom: 80,
                    }}
                >
                    {[
                        { val: 70, label: "des Français achètent en ligne", delay: 0 },
                        {
                            val: 79,
                            label: "préfèrent acheter local",
                            delay: 0.15,
                        },
                    ].map((stat, i) => (
                        <>
                            {i === 1 && (
                                <div
                                    key="sep"
                                    style={{
                                        background: "rgba(255,255,255,0.07)",
                                        margin: "8px 0",
                                    }}
                                />
                            )}
                            <motion.div
                                key={stat.val}
                                initial={{ opacity: 0, y: 40 }}
                                animate={inView ? { opacity: 1, y: 0 } : {}}
                                transition={{
                                    duration: 0.75,
                                    delay: stat.delay,
                                    ease: E,
                                }}
                                style={{ textAlign: "center", padding: "0 40px" }}
                            >
                                <div
                                    style={{
                                        fontSize: "clamp(72px, 11vw, 144px)",
                                        fontWeight: 900,
                                        color: "#C8813A",
                                        lineHeight: 1,
                                        letterSpacing: "-0.04em",
                                    }}
                                >
                                    <Counter to={stat.val} inView={inView} />%
                                </div>
                                <div
                                    style={{
                                        marginTop: 16,
                                        fontSize: 15,
                                        color: "rgba(245,237,214,0.55)",
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {stat.label}
                                </div>
                            </motion.div>
                        </>
                    ))}
                </div>

                {/* Punchline */}
                <motion.p
                    initial={{ opacity: 0, y: 28 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.75, delay: 0.32, ease: E }}
                    style={{
                        textAlign: "center",
                        fontSize: "clamp(22px, 3.5vw, 46px)",
                        fontWeight: 700,
                        color: "#F5EDD6",
                        lineHeight: 1.2,
                        letterSpacing: "-0.025em",
                        margin: 0,
                    }}
                >
                    Le problème ?{" "}
                    <em style={{ fontStyle: "italic", color: "#C8813A" }}>
                        Ils ne vous trouvent pas.
                    </em>
                </motion.p>
            </div>
        </section>
    );
}

/* ── How ─────────────────────────────────────────────────────────────── */

function How() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });

    const steps = [
        {
            num: "01",
            title: "Vous renseignez votre stock",
            desc: "Référence, marque, taille, quantité. En quelques minutes depuis votre téléphone. Sans site e-commerce, sans logistique.",
            bg: "#EDE0C4",
            numColor: "rgba(44,32,24,0.1)",
            titleColor: "#2C2018",
            descColor: "#6B4F38",
        },
        {
            num: "02",
            title: "Un client cherche ce produit exact",
            desc: "Il tape la référence précise dans Two-Step. Il voit votre boutique apparaître — avec la distance et le stock disponible.",
            bg: "#2C2018",
            numColor: "#C8813A",
            titleColor: "#F5EDD6",
            descColor: "rgba(245,237,214,0.6)",
        },
        {
            num: "03",
            title: "Il entre. Il achète.",
            desc: "Un client qui vient sait déjà ce qu'il veut. Il n'hésite pas. Vous le fidélisez — là où Amazon ne peut pas.",
            bg: "#C8813A",
            numColor: "rgba(245,237,214,0.18)",
            titleColor: "#F5EDD6",
            descColor: "rgba(245,237,214,0.8)",
        },
    ];

    return (
        <section
            id="comment"
            ref={ref}
            style={{ background: "#F5EDD6", padding: "120px 48px" }}
        >
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                <motion.div
                    initial={{ opacity: 0, y: 32 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, ease: E }}
                    style={{ marginBottom: 72 }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#C8813A",
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            marginBottom: 16,
                        }}
                    >
                        Comment ça marche
                    </div>
                    <h2
                        style={{
                            fontSize: "clamp(36px, 5vw, 64px)",
                            fontWeight: 800,
                            color: "#2C2018",
                            lineHeight: 1.06,
                            letterSpacing: "-0.03em",
                            margin: 0,
                            maxWidth: 560,
                        }}
                    >
                        Simple comme{" "}
                        <em style={{ fontStyle: "italic", color: "#C8813A" }}>
                            deux pas.
                        </em>
                    </h2>
                </motion.div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 20,
                    }}
                >
                    {steps.map((step, i) => (
                        <motion.div
                            key={step.num}
                            initial={{ opacity: 0, y: 56 }}
                            animate={inView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.75, delay: i * 0.13, ease: E }}
                            whileHover={{
                                y: -8,
                                transition: { duration: 0.28, ease: "easeOut" },
                            }}
                            style={{
                                background: step.bg,
                                borderRadius: 28,
                                padding: "48px 40px 44px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 20,
                                cursor: "default",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 56,
                                    fontWeight: 900,
                                    color: step.numColor,
                                    lineHeight: 1,
                                    letterSpacing: "-0.04em",
                                }}
                            >
                                {step.num}
                            </span>
                            <div>
                                <h3
                                    style={{
                                        fontSize: 18,
                                        fontWeight: 700,
                                        color: step.titleColor,
                                        lineHeight: 1.3,
                                        letterSpacing: "-0.02em",
                                        margin: "0 0 12px",
                                    }}
                                >
                                    {step.title}
                                </h3>
                                <p
                                    style={{
                                        fontSize: 14,
                                        color: step.descColor,
                                        lineHeight: 1.65,
                                        margin: 0,
                                    }}
                                >
                                    {step.desc}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ── About ───────────────────────────────────────────────────────────── */

function About() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });

    return (
        <section
            ref={ref}
            style={{
                background: "#EDE0C4",
                padding: "120px 48px",
                overflow: "hidden",
                position: "relative",
            }}
        >
            <div
                style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}
            >
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 80,
                        alignItems: "center",
                    }}
                >
                    {/* Left */}
                    <motion.div
                        initial={{ opacity: 0, x: -40 }}
                        animate={inView ? { opacity: 1, x: 0 } : {}}
                        transition={{ duration: 0.8, ease: E }}
                    >
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#C8813A",
                                letterSpacing: "0.14em",
                                textTransform: "uppercase",
                                marginBottom: 20,
                            }}
                        >
                            À propos
                        </div>
                        <h2
                            style={{
                                fontSize: "clamp(36px, 5.5vw, 68px)",
                                fontWeight: 800,
                                color: "#2C2018",
                                lineHeight: 1.04,
                                letterSpacing: "-0.03em",
                                margin: 0,
                            }}
                        >
                            Nés à Toulouse,
                            <br />
                            <em style={{ fontStyle: "italic", color: "#C8813A" }}>
                                fondateurs
                            </em>
                            <br />
                            de Two-Step.
                        </h2>
                    </motion.div>

                    {/* Right */}
                    <motion.div
                        initial={{ opacity: 0, x: 40 }}
                        animate={inView ? { opacity: 1, x: 0 } : {}}
                        transition={{ duration: 0.8, delay: 0.15, ease: E }}
                    >
                        <p
                            style={{
                                fontSize: "clamp(15px, 1.7vw, 18px)",
                                color: "#2C2018",
                                lineHeight: 1.72,
                                margin: "0 0 20px",
                            }}
                        >
                            Deux frères qui ont vu leurs commerçants préférés perdre
                            des ventes au profit d'Amazon — non pas parce que les
                            clients préféraient commander en ligne, mais parce qu'ils
                            ne savaient pas que le stock existait en boutique.
                        </p>
                        <p
                            style={{
                                fontSize: "clamp(15px, 1.7vw, 18px)",
                                color: "#6B4F38",
                                lineHeight: 1.72,
                                margin: 0,
                            }}
                        >
                            Two-Step, c'est l'outil que les commerçants locaux
                            n'avaient pas encore.
                        </p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

/* ── Contact ─────────────────────────────────────────────────────────── */

function Contact() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });
    const [status, setStatus] = useState<
        "idle" | "sending" | "sent" | "error"
    >("idle");

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setStatus("sending");
        const data = new FormData(e.currentTarget);
        try {
            const res = await fetch("https://formspree.io/f/xlgpapze", {
                method: "POST",
                body: data,
                headers: { Accept: "application/json" },
            });
            if (res.ok) {
                setStatus("sent");
                (e.target as HTMLFormElement).reset();
            } else {
                setStatus("error");
            }
        } catch {
            setStatus("error");
        }
    }

    return (
        <section
            id="contact"
            ref={ref}
            style={{ background: "#F5EDD6", padding: "120px 48px" }}
        >
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
                <motion.div
                    initial={{ opacity: 0, y: 32 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, ease: E }}
                    style={{ marginBottom: 56 }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#C8813A",
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            marginBottom: 16,
                        }}
                    >
                        Vous êtes commerçant à Toulouse ?
                    </div>
                    <h2
                        style={{
                            fontSize: "clamp(32px, 4.5vw, 56px)",
                            fontWeight: 800,
                            color: "#2C2018",
                            lineHeight: 1.08,
                            letterSpacing: "-0.03em",
                            margin: 0,
                        }}
                    >
                        Rejoignez les{" "}
                        <em style={{ fontStyle: "italic", color: "#C8813A" }}>
                            pionniers.
                        </em>
                    </h2>
                </motion.div>

                {status === "sent" ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.93 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{
                            padding: "56px 48px",
                            borderRadius: 24,
                            background: "#2C2018",
                            textAlign: "center",
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{
                                type: "spring",
                                stiffness: 260,
                                damping: 20,
                                delay: 0.1,
                            }}
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: "50%",
                                background: "#C8813A",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                margin: "0 auto 20px",
                                fontSize: 22,
                                color: "#fff",
                                fontWeight: 700,
                            }}
                        >
                            ✓
                        </motion.div>
                        <p
                            style={{
                                color: "#F5EDD6",
                                fontWeight: 600,
                                fontSize: 18,
                                margin: 0,
                            }}
                        >
                            Message reçu. On vous contacte sous 48h.
                        </p>
                    </motion.div>
                ) : (
                    <motion.form
                        onSubmit={handleSubmit}
                        initial={{ opacity: 0, y: 24 }}
                        animate={inView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.7, delay: 0.15, ease: E }}
                        style={{ display: "flex", flexDirection: "column", gap: 32 }}
                    >
                        {[
                            {
                                name: "name",
                                label: "Votre nom",
                                type: "text",
                                placeholder: "Marie Dupont",
                            },
                            {
                                name: "shop",
                                label: "Votre boutique",
                                type: "text",
                                placeholder: "Librairie Les Mots Voyageurs",
                            },
                            {
                                name: "email",
                                label: "Votre email",
                                type: "email",
                                placeholder: "marie@maboutique.fr",
                            },
                        ].map((field, i) => (
                            <motion.div
                                key={field.name}
                                initial={{ opacity: 0, x: -16 }}
                                animate={inView ? { opacity: 1, x: 0 } : {}}
                                transition={{
                                    duration: 0.5,
                                    delay: 0.22 + i * 0.09,
                                    ease: E,
                                }}
                                style={{ display: "flex", flexDirection: "column", gap: 8 }}
                            >
                                <label
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: "#C8813A",
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    {field.label}
                                </label>
                                <input
                                    name={field.name}
                                    type={field.type}
                                    placeholder={field.placeholder}
                                    required
                                    style={{
                                        border: "none",
                                        borderBottom: "2px solid rgba(44,32,24,0.18)",
                                        background: "transparent",
                                        padding: "10px 0",
                                        fontSize: 17,
                                        fontFamily: "inherit",
                                        color: "#2C2018",
                                        outline: "none",
                                        transition: "border-color 0.2s",
                                    }}
                                    onFocus={(e) => {
                                        e.target.style.borderBottomColor = "#C8813A";
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderBottomColor =
                                            "rgba(44,32,24,0.18)";
                                    }}
                                />
                            </motion.div>
                        ))}

                        <motion.button
                            type="submit"
                            disabled={status === "sending"}
                            whileHover={{
                                scale: 1.04,
                                boxShadow: "0 10px 36px rgba(44,32,24,0.25)",
                            }}
                            whileTap={{ scale: 0.97 }}
                            style={{
                                marginTop: 8,
                                padding: "18px 40px",
                                borderRadius: 999,
                                background: "#2C2018",
                                color: "#F5EDD6",
                                fontWeight: 700,
                                fontSize: 16,
                                border: "none",
                                cursor: "pointer",
                                letterSpacing: "-0.01em",
                                alignSelf: "flex-start",
                                fontFamily: "inherit",
                            }}
                        >
                            {status === "sending"
                                ? "Envoi en cours…"
                                : "Je veux être contacté →"}
                        </motion.button>

                        {status === "error" && (
                            <p style={{ color: "#C8813A", fontSize: 14, margin: 0 }}>
                                Une erreur s'est produite. Écrivez-nous à{" "}
                                <a
                                    href="mailto:contact@twostep.fr"
                                    style={{ color: "#C8813A" }}
                                >
                                    contact@twostep.fr
                                </a>
                            </p>
                        )}
                    </motion.form>
                )}
            </div>
        </section>
    );
}

/* ── Footer ──────────────────────────────────────────────────────────── */

function Footer() {
    return (
        <footer
            style={{
                background: "#2C2018",
                padding: "40px 48px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
            }}
        >
            <span
                style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#F5EDD6",
                    letterSpacing: "-0.03em",
                }}
            >
                Two-Step
            </span>
            <span style={{ fontSize: 13, color: "rgba(245,237,214,0.38)" }}>
                © 2025 · Toulouse, France
            </span>
        </footer>
    );
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function HomeScreen() {
    return (
        <>
            <Nav />
            <main>
                <Hero />
                <Marquee />
                <Statement />
                <Marquee />
                <How />
                <About />
                <Contact />
            </main>
            <Footer />
        </>
    );
}

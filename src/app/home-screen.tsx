"use client";

import { animate, motion, useInView, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

/* ── Counter animation ──────────────────────────────── */

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

/* ── Shared variants ────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EASE = [0.22, 1, 0.36, 1] as any;

const up = {
    hidden: { opacity: 0, y: 48 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } },
};

const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.13 } },
};

/* ── Nav ─────────────────────────────────────────────── */

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
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#2C2018",
                    letterSpacing: "-0.03em",
                }}
            >
                Two-Step
            </span>

            <motion.a
                href="#contact"
                whileHover={{ scale: 1.05, boxShadow: "0 6px 24px rgba(200,129,58,0.3)" }}
                whileTap={{ scale: 0.96 }}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 22px",
                    borderRadius: 999,
                    background: "#C8813A",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: "none",
                    letterSpacing: "-0.01em",
                }}
            >
                Être contacté →
            </motion.a>
        </motion.nav>
    );
}

/* ── Hero ─────────────────────────────────────────────── */

function Hero() {
    const { scrollY } = useScroll();
    const imgY = useTransform(scrollY, [0, 600], [0, -40]);

    return (
        <section
            style={{
                minHeight: "100vh",
                background: "#F5EDD6",
                display: "flex",
                alignItems: "center",
                padding: "120px 48px 80px",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* Background watermark */}
            <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.035 }}
                transition={{ duration: 2, delay: 0.8 }}
                style={{
                    position: "absolute",
                    right: -40,
                    bottom: -80,
                    fontSize: "clamp(200px, 32vw, 380px)",
                    fontWeight: 900,
                    color: "#2C2018",
                    lineHeight: 1,
                    userSelect: "none",
                    letterSpacing: "-0.05em",
                    pointerEvents: "none",
                }}
            >
                TS
            </motion.span>

            <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", position: "relative", zIndex: 1 }}>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 40,
                        alignItems: "center",
                    }}
                >
                    {/* Left — text */}
                    <motion.div variants={stagger} initial="hidden" animate="visible" style={{ maxWidth: 680 }}>
                        {/* Pill label */}
                        <motion.div
                            variants={up}
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
                            <span
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: "#C8813A",
                                    flexShrink: 0,
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
                                Commerce local · Toulouse
                            </span>
                        </motion.div>

                        {/* Headline */}
                        <motion.h1
                            variants={up}
                            style={{
                                fontSize: "clamp(44px, 6.5vw, 84px)",
                                fontWeight: 800,
                                lineHeight: 1.04,
                                letterSpacing: "-0.035em",
                                color: "#2C2018",
                                margin: "0 0 28px",
                            }}
                        >
                            Vos clients veulent
                            <br />
                            acheter{" "}
                            <em style={{ fontStyle: "italic", color: "#C8813A" }}>chez vous.</em>
                        </motion.h1>

                        {/* Subtext */}
                        <motion.p
                            variants={up}
                            style={{
                                fontSize: "clamp(16px, 1.8vw, 19px)",
                                color: "#6B4F38",
                                lineHeight: 1.65,
                                maxWidth: 500,
                                margin: "0 0 48px",
                            }}
                        >
                            Two-Step rend votre stock visible aux consommateurs de votre quartier.
                            En temps réel, sans site e-commerce, sans livraison.
                        </motion.p>

                        {/* CTA row */}
                        <motion.div
                            variants={up}
                            style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}
                        >
                            <motion.a
                                href="#contact"
                                whileHover={{ scale: 1.04, boxShadow: "0 10px 36px rgba(200,129,58,0.38)" }}
                                whileTap={{ scale: 0.97 }}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "16px 32px",
                                    borderRadius: 999,
                                    background: "#2C2018",
                                    color: "#F5EDD6",
                                    fontWeight: 700,
                                    fontSize: 16,
                                    textDecoration: "none",
                                    letterSpacing: "-0.01em",
                                }}
                            >
                                Je veux être pionnier →
                            </motion.a>

                            <motion.a
                                href="#comment"
                                whileHover={{ color: "#C8813A" }}
                                style={{
                                    fontSize: 15,
                                    color: "#6B4F38",
                                    textDecoration: "none",
                                    fontWeight: 600,
                                    transition: "color 0.2s",
                                }}
                            >
                                Comment ça marche ↓
                            </motion.a>
                        </motion.div>
                    </motion.div>

                    {/* Right — floating illustration */}
                    <motion.div
                        style={{ y: imgY, flexShrink: 0 }}
                        initial={{ opacity: 0, scale: 0.88, x: 40 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        transition={{ duration: 1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <motion.img
                            src="/hero.png"
                            alt="Deux personnes découvrant une boutique locale"
                            animate={{ y: [0, -14, 0] }}
                            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                            style={{
                                width: "clamp(220px, 30vw, 440px)",
                                height: "auto",
                                display: "block",
                                filter: "drop-shadow(0 24px 48px rgba(44,32,24,0.18))",
                            }}
                        />
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

/* ── Statement ───────────────────────────────────────── */

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
            {/* Glow */}
            <div
                style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 700,
                    height: 700,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(200,129,58,0.09) 0%, transparent 65%)",
                    pointerEvents: "none",
                }}
            />

            <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>
                {/* Stats */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1px 1fr",
                        marginBottom: 72,
                    }}
                >
                    {[
                        { val: 70, label: "des Français achètent en ligne", delay: 0 },
                        { val: 79, label: "préfèrent acheter local", delay: 0.15 },
                    ].map((stat, i) => (
                        <>
                            {i === 1 && (
                                <div
                                    key="divider"
                                    style={{ background: "rgba(255,255,255,0.07)", margin: "8px 0" }}
                                />
                            )}
                            <motion.div
                                key={stat.val}
                                initial={{ opacity: 0, y: 40 }}
                                animate={inView ? { opacity: 1, y: 0 } : {}}
                                transition={{ duration: 0.75, delay: stat.delay, ease: [0.22, 1, 0.36, 1] }}
                                style={{ textAlign: "center", padding: "0 40px" }}
                            >
                                <div
                                    style={{
                                        fontSize: "clamp(72px, 11vw, 136px)",
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
                                        fontSize: 16,
                                        color: "rgba(245,237,214,0.65)",
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
                    transition={{ duration: 0.75, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        textAlign: "center",
                        fontSize: "clamp(22px, 3.5vw, 42px)",
                        fontWeight: 700,
                        color: "#F5EDD6",
                        lineHeight: 1.25,
                        letterSpacing: "-0.025em",
                        margin: 0,
                    }}
                >
                    Le problème ?{" "}
                    <em style={{ fontStyle: "italic", color: "#C8813A" }}>Ils ne vous trouvent pas.</em>
                </motion.p>
            </div>
        </section>
    );
}

/* ── How ─────────────────────────────────────────────── */

function How() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });

    const steps = [
        {
            num: "01",
            title: "Vous renseignez votre stock",
            desc: "En quelques minutes sur votre téléphone. Pas de site e-commerce, pas de logistique.",
            bg: "#EDE0C4",
            numColor: "rgba(44,32,24,0.12)",
            titleColor: "#2C2018",
            textColor: "#6B4F38",
        },
        {
            num: "02",
            title: "Vos clients cherchent près de chez eux",
            desc: "En temps réel, sur l'application Two-Step. Ils voient ce que vous avez en rayon.",
            bg: "#2C2018",
            numColor: "#C8813A",
            titleColor: "#F5EDD6",
            textColor: "rgba(245,237,214,0.7)",
        },
        {
            num: "03",
            title: "Ils entrent dans votre boutique",
            desc: "Le trafic en magasin augmente. Vous les fidélisez durablement.",
            bg: "#C8813A",
            numColor: "rgba(245,237,214,0.2)",
            titleColor: "#F5EDD6",
            textColor: "rgba(245,237,214,0.8)",
        },
    ];

    return (
        <section
            id="comment"
            ref={ref}
            style={{ background: "#F5EDD6", padding: "120px 48px" }}
        >
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 32 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    style={{ marginBottom: 72 }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#C8813A",
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            marginBottom: 16,
                        }}
                    >
                        Comment ça marche
                    </div>
                    <h2
                        style={{
                            fontSize: "clamp(36px, 5vw, 62px)",
                            fontWeight: 800,
                            color: "#2C2018",
                            lineHeight: 1.08,
                            letterSpacing: "-0.03em",
                            margin: 0,
                            maxWidth: 580,
                        }}
                    >
                        Simple comme{" "}
                        <em style={{ fontStyle: "italic", color: "#C8813A" }}>deux pas.</em>
                    </h2>
                </motion.div>

                {/* Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
                    {steps.map((step, i) => (
                        <motion.div
                            key={step.num}
                            initial={{ opacity: 0, y: 56 }}
                            animate={inView ? { opacity: 1, y: 0 } : {}}
                            transition={{
                                duration: 0.75,
                                delay: i * 0.14,
                                ease: [0.22, 1, 0.36, 1],
                            }}
                            whileHover={{ y: -6, transition: { duration: 0.3, ease: "easeOut" } }}
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
                                    fontSize: 52,
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
                                        fontSize: 19,
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
                                        fontSize: 15,
                                        color: step.textColor,
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

/* ── About ───────────────────────────────────────────── */

function About() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });

    return (
        <section
            ref={ref}
            style={{
                background: "#7A9E7E",
                padding: "120px 48px",
                overflow: "hidden",
                position: "relative",
            }}
        >
            {/* Large background text */}
            <motion.span
                initial={{ opacity: 0, x: 80 }}
                animate={inView ? { opacity: 0.08, x: 0 } : {}}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                style={{
                    position: "absolute",
                    right: -20,
                    bottom: -60,
                    fontSize: "clamp(160px, 24vw, 300px)",
                    fontWeight: 900,
                    color: "#2C2018",
                    lineHeight: 1,
                    userSelect: "none",
                    letterSpacing: "-0.05em",
                    pointerEvents: "none",
                }}
            >
                bauland
            </motion.span>

            <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>
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
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "rgba(245,237,214,0.75)",
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                marginBottom: 20,
                            }}
                        >
                            À propos
                        </div>
                        <h2
                            style={{
                                fontSize: "clamp(40px, 6vw, 72px)",
                                fontWeight: 800,
                                color: "#F5EDD6",
                                lineHeight: 1.04,
                                letterSpacing: "-0.03em",
                                margin: 0,
                            }}
                        >
                            Deux frères.
                            <br />
                            <em style={{ fontStyle: "italic" }}>Une mission.</em>
                        </h2>
                    </motion.div>

                    {/* Right */}
                    <motion.div
                        initial={{ opacity: 0, x: 40 }}
                        animate={inView ? { opacity: 1, x: 0 } : {}}
                        transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <p
                            style={{
                                fontSize: "clamp(15px, 1.7vw, 18px)",
                                color: "#F5EDD6",
                                lineHeight: 1.72,
                                margin: "0 0 20px",
                            }}
                        >
                            Thomas est kiné. Il voyait ses patients commander leurs produits en ligne
                            plutôt que chez le pharmacien du quartier — pas parce qu'ils préféraient
                            Amazon, mais parce qu'ils ne savaient pas que la pharmacie les avait en stock.
                        </p>
                        <p
                            style={{
                                fontSize: "clamp(15px, 1.7vw, 18px)",
                                color: "rgba(245,237,214,0.75)",
                                lineHeight: 1.72,
                                margin: 0,
                            }}
                        >
                            Avec son frère, ils ont décidé de régler ce problème. Two-Step, c'est
                            l'outil que les commerçants n'avaient pas encore.
                        </p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

/* ── Contact ─────────────────────────────────────────── */

function Contact() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });
    const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

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
            style={{ background: "#EDE0C4", padding: "120px 48px" }}
        >
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
                <motion.div
                    initial={{ opacity: 0, y: 32 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    style={{ marginBottom: 56 }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#C8813A",
                            letterSpacing: "0.12em",
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
                        <em style={{ fontStyle: "italic", color: "#C8813A" }}>pionniers.</em>
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
                            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
                            style={{
                                width: 56,
                                height: 56,
                                borderRadius: "50%",
                                background: "#C8813A",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                margin: "0 auto 20px",
                                fontSize: 24,
                            }}
                        >
                            ✓
                        </motion.div>
                        <p style={{ color: "#F5EDD6", fontWeight: 600, fontSize: 18, margin: 0 }}>
                            Message reçu. On vous contacte sous 48h.
                        </p>
                    </motion.div>
                ) : (
                    <motion.form
                        onSubmit={handleSubmit}
                        initial={{ opacity: 0, y: 24 }}
                        animate={inView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                        style={{ display: "flex", flexDirection: "column", gap: 32 }}
                    >
                        {[
                            { name: "name", label: "Votre nom", type: "text", placeholder: "Marie Dupont" },
                            { name: "shop", label: "Votre boutique", type: "text", placeholder: "Librairie Les Mots Voyageurs" },
                            { name: "email", label: "Votre email", type: "email", placeholder: "marie@maboutique.fr" },
                        ].map((field, i) => (
                            <motion.div
                                key={field.name}
                                initial={{ opacity: 0, x: -16 }}
                                animate={inView ? { opacity: 1, x: 0 } : {}}
                                transition={{
                                    duration: 0.5,
                                    delay: 0.22 + i * 0.09,
                                    ease: [0.22, 1, 0.36, 1],
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
                                        e.target.style.borderBottomColor = "rgba(44,32,24,0.18)";
                                    }}
                                />
                            </motion.div>
                        ))}

                        <motion.button
                            type="submit"
                            disabled={status === "sending"}
                            whileHover={{
                                scale: 1.04,
                                boxShadow: "0 10px 36px rgba(44,32,24,0.28)",
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
                            {status === "sending" ? "Envoi en cours…" : "Je veux être contacté →"}
                        </motion.button>

                        {status === "error" && (
                            <p style={{ color: "#C8813A", fontSize: 14, margin: 0 }}>
                                Une erreur s'est produite. Écrivez-nous directement à{" "}
                                <a
                                    href="mailto:bauland@twostep.fr"
                                    style={{ color: "#C8813A" }}
                                >
                                    bauland@twostep.fr
                                </a>
                            </p>
                        )}
                    </motion.form>
                )}
            </div>
        </section>
    );
}

/* ── Footer ───────────────────────────────────────────── */

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
            <span style={{ fontSize: 18, fontWeight: 800, color: "#F5EDD6", letterSpacing: "-0.03em" }}>
                Two-Step
            </span>
            <span style={{ fontSize: 13, color: "rgba(245,237,214,0.4)" }}>
                © 2025 · bauland@twostep.fr
            </span>
        </footer>
    );
}

/* ── Page ─────────────────────────────────────────────── */

export default function HomeScreen() {
    return (
        <>
            <Nav />
            <main>
                <Hero />
                <Statement />
                <How />
                <About />
                <Contact />
            </main>
            <Footer />
        </>
    );
}

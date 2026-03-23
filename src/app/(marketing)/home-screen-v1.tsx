"use client";

import { animate, motion, useInView, useScroll, useTransform } from "motion/react";
import { Fragment, useEffect, useRef, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E = [0.22, 1, 0.36, 1] as any;

/* ── Mobile detection ────────────────────────────────────────────────── */

function useIsMobile() {
    const [mobile, setMobile] = useState(false);
    useEffect(() => {
        const check = () => setMobile(window.innerWidth < 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);
    return mobile;
}

/* ── Counter ─────────────────────────────────────────────────────────── */

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

/* ── Floating card ───────────────────────────────────────────────────── */

interface FloatCardProps {
    top?: string | number;
    bottom?: string | number;
    left?: string | number;
    right?: string | number;
    delay?: number;
    floatDuration?: number;
    children: React.ReactNode;
}

function FloatCard({ top, bottom, left, right, delay = 0, floatDuration = 4, children }: FloatCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.72, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: [0, -13, 0] }}
            transition={{
                opacity: { duration: 0.45, delay },
                scale: { duration: 0.6, delay, ease: E },
                y: { duration: floatDuration, repeat: Infinity, ease: "easeInOut", delay: delay + 0.6 },
            }}
            style={{
                position: "absolute",
                top, bottom, left, right,
                background: "#fff",
                borderRadius: 16,
                padding: "10px 16px",
                boxShadow: "0 8px 32px rgba(44,32,24,0.13), 0 2px 8px rgba(44,32,24,0.06)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                zIndex: 10,
                userSelect: "none",
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </motion.div>
    );
}

/* ── Marquee ─────────────────────────────────────────────────────────── */

function Marquee() {
    const base = "COMMERCE LOCAL  ·  STOCK VISIBLE  ·  TEMPS RÉEL  ·  TOULOUSE  ·  ZÉRO SAISIE  ·  VOS CLIENTS VIENNENT À VOUS  ·  ";
    return (
        <div style={{ overflow: "hidden", background: "#C8813A", padding: "13px 0" }}>
            <motion.div
                animate={{ x: ["0%", "-50%"] }}
                transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
                style={{ display: "inline-flex", whiteSpace: "nowrap" }}
            >
                {[0, 1, 2, 3].map((i) => (
                    <span key={i} style={{ color: "#F5EDD6", fontWeight: 700, fontSize: 11, letterSpacing: "0.14em" }}>
                        {base}
                    </span>
                ))}
            </motion.div>
        </div>
    );
}

/* ── Nav ─────────────────────────────────────────────────────────────── */

function Nav() {
    const isMobile = useIsMobile();
    return (
        <motion.nav
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{
                position: "fixed",
                top: 0, left: 0, right: 0,
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: isMobile ? "0 20px" : "0 48px",
                height: 64,
                background: "rgba(245, 237, 214, 0.9)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderBottom: "1px solid rgba(200, 129, 58, 0.1)",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src="/logo-icon.webp" alt="" style={{ height: 32, width: 32, borderRadius: 8 }} />
                <span style={{ fontSize: 17, fontWeight: 800, color: "#2C2018", letterSpacing: "-0.03em" }}>
                    Two-Step
                </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {!isMobile && (
                    <a href="#comment" style={{
                        padding: "8px 18px",
                        borderRadius: 999,
                        border: "1.5px solid rgba(44,32,24,0.15)",
                        color: "#2C2018",
                        fontWeight: 600,
                        fontSize: 13,
                        textDecoration: "none",
                    }}>
                        Comment ça marche
                    </a>
                )}
                <motion.a
                    href="#contact"
                    whileHover={{ scale: 1.05, boxShadow: "0 6px 24px rgba(200,129,58,0.35)" }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                        padding: isMobile ? "9px 18px" : "10px 22px",
                        borderRadius: 999,
                        background: "#C8813A",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 13,
                        textDecoration: "none",
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
    const isMobile = useIsMobile();
    const { scrollY } = useScroll();
    const imgY = useTransform(scrollY, [0, 700], [0, -50]);
    const textY = useTransform(scrollY, [0, 700], [0, -20]);

    return (
        <section style={{
            minHeight: "100vh",
            background: "#F5EDD6",
            display: "flex",
            alignItems: "center",
            padding: isMobile ? "90px 24px 60px" : "100px 48px 80px",
            position: "relative",
            overflow: "hidden",
        }}>
            {/* Glow */}
            <div style={{
                position: "absolute",
                top: "30%", right: "15%",
                width: 500, height: 500,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(200,129,58,0.11) 0%, transparent 70%)",
                pointerEvents: "none",
            }} />

            <div style={{
                maxWidth: 1200,
                margin: "0 auto",
                width: "100%",
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "3fr 2fr",
                gap: isMobile ? 48 : 64,
                alignItems: "center",
            }}>
                {/* Left — text */}
                <motion.div style={{ y: textY }}>
                    {/* Pill label */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, delay: 0.1, ease: E }}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 28,
                            padding: "6px 16px",
                            borderRadius: 999,
                            background: "rgba(200, 129, 58, 0.12)",
                            border: "1px solid rgba(200, 129, 58, 0.28)",
                        }}
                    >
                        <motion.span
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{ width: 7, height: 7, borderRadius: "50%", background: "#C8813A", flexShrink: 0, display: "block" }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#C8813A", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            Disponible à Toulouse
                        </span>
                    </motion.div>

                    {/* Title */}
                    <motion.h1
                        initial={{ opacity: 0, y: 32 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.18, ease: E }}
                        style={{
                            fontSize: isMobile ? "clamp(38px, 9vw, 52px)" : "clamp(48px, 5.5vw, 80px)",
                            fontWeight: 800,
                            lineHeight: 1.1,
                            letterSpacing: "-0.035em",
                            color: "#2C2018",
                            margin: "0 0 24px",
                        }}
                    >
                        Votre produit exact{" "}
                        <em style={{ fontStyle: "italic", color: "#C8813A" }}>est là.</em>
                        <br />
                        À deux pas de chez vous.
                    </motion.h1>

                    {/* Subtext */}
                    <motion.p
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.32, ease: E }}
                        style={{
                            fontSize: isMobile ? 16 : 18,
                            color: "#6B4F38",
                            lineHeight: 1.65,
                            maxWidth: 480,
                            margin: "0 0 36px",
                        }}
                    >
                        Cet article qui te fait envie depuis des jours ? Une boutique du quartier l'a en stock.
                        Two-Step te dit laquelle. Et dans combien de minutes tu peux y être.
                    </motion.p>

                    {/* CTA */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.42, ease: E }}
                        style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}
                    >
                        <motion.a
                            href="#contact"
                            whileHover={{ scale: 1.05, boxShadow: "0 12px 40px rgba(200,129,58,0.42)" }}
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
                        {!isMobile && (
                            <a href="#comment" style={{ fontSize: 14, color: "#6B4F38", fontWeight: 600, textDecoration: "none", opacity: 0.8 }}>
                                Comment ça marche ↓
                            </a>
                        )}
                    </motion.div>
                </motion.div>

                {/* Right — illustration + floating cards (desktop only) */}
                <motion.div
                    style={{
                        y: isMobile ? 0 : imgY,
                        position: "relative",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    {!isMobile && (
                        <>
                            <FloatCard top="2%" left="-12%" delay={0.7} floatDuration={4.3}>
                                <span style={{ fontSize: 18 }}>🔍</span>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: "#2C2018", lineHeight: 1.2 }}>Nike Air Max 90 · T.42</div>
                                    <div style={{ fontSize: 11, color: "#7A9E7E", fontWeight: 600, marginTop: 2 }}>✓ En stock · 8 min</div>
                                </div>
                            </FloatCard>

                            <FloatCard top="20%" right="-14%" delay={0.95} floatDuration={3.7}>
                                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(200,129,58,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>📍</div>
                                <div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color: "#C8813A", letterSpacing: "-0.04em", lineHeight: 1 }}>8 min</div>
                                    <div style={{ fontSize: 11, color: "#6B4F38", fontWeight: 500, marginTop: 2 }}>de chez vous</div>
                                </div>
                            </FloatCard>

                            <FloatCard bottom="12%" left="-10%" delay={1.15} floatDuration={5.1}>
                                <div style={{ width: 28, height: 28, borderRadius: 8, background: "#2C2018", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🛍️</div>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: "#2C2018", lineHeight: 1.2 }}>2 en stock</div>
                                    <div style={{ fontSize: 11, color: "#6B4F38", fontWeight: 500, marginTop: 2 }}>Boutique Carmes</div>
                                </div>
                            </FloatCard>

                            <FloatCard bottom="30%" right="-10%" delay={1.35} floatDuration={3.9}>
                                <motion.div
                                    style={{ width: 8, height: 8, borderRadius: "50%", background: "#7A9E7E", flexShrink: 0 }}
                                    animate={{ opacity: [1, 0.3, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                />
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#2C2018" }}>Temps réel · Toulouse</span>
                            </FloatCard>
                        </>
                    )}

                    <motion.img
                        src="/hero.png"
                        alt="Commerce local"
                        initial={{ opacity: 0, scale: 0.85, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 1, delay: 0.2, ease: E }}
                        style={{
                            width: "100%",
                            maxWidth: isMobile ? 280 : 440,
                            height: "auto",
                            display: "block",
                            filter: "drop-shadow(0 32px 64px rgba(44,32,24,0.16))",
                        }}
                    />
                </motion.div>
            </div>
        </section>
    );
}

/* ── Statement ───────────────────────────────────────────────────────── */

function Statement() {
    const isMobile = useIsMobile();
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-12%" });

    return (
        <section ref={ref} style={{
            background: "#2C2018",
            padding: isMobile ? "80px 24px" : "120px 48px",
            position: "relative",
            overflow: "hidden",
        }}>
            <div style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(ellipse at 50% 50%, rgba(200,129,58,0.1) 0%, transparent 65%)",
                pointerEvents: "none",
            }} />
            <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>
                <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1px 1fr",
                    gap: isMobile ? 48 : 0,
                    marginBottom: isMobile ? 48 : 80,
                }}>
                    {[
                        { val: 80, label: "se renseignent en ligne avant d'acheter en magasin", delay: 0 },
                        { val: 79, label: "veulent soutenir le commerce local en priorité", delay: 0.15 },
                    ].map((stat, i) => (
                        <Fragment key={stat.val}>
                            {i === 1 && !isMobile && (
                                <div style={{ background: "rgba(255,255,255,0.07)", margin: "8px 0" }} />
                            )}
                            <motion.div
                                initial={{ opacity: 0, y: 40 }}
                                animate={inView ? { opacity: 1, y: 0 } : {}}
                                transition={{ duration: 0.75, delay: stat.delay, ease: E }}
                                style={{ textAlign: "center", padding: isMobile ? 0 : "0 40px" }}
                            >
                                <div style={{
                                    fontSize: isMobile ? "clamp(72px, 20vw, 100px)" : "clamp(72px, 10vw, 136px)",
                                    fontWeight: 900,
                                    color: "#C8813A",
                                    lineHeight: 1,
                                    letterSpacing: "-0.04em",
                                }}>
                                    <Counter to={stat.val} inView={inView} />%
                                </div>
                                <div style={{ marginTop: 14, fontSize: 15, color: "rgba(245,237,214,0.55)", lineHeight: 1.5 }}>
                                    {stat.label}
                                </div>
                            </motion.div>
                        </Fragment>
                    ))}
                </div>

                <motion.p
                    initial={{ opacity: 0, y: 28 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.75, delay: 0.32, ease: E }}
                    style={{
                        textAlign: "center",
                        fontSize: isMobile ? "clamp(20px, 5.5vw, 28px)" : "clamp(22px, 3.5vw, 46px)",
                        fontWeight: 700,
                        color: "#F5EDD6",
                        lineHeight: 1.25,
                        letterSpacing: "-0.025em",
                        margin: 0,
                    }}
                >
                    Le problème ?{" "}
                    <em style={{ fontStyle: "italic", color: "#C8813A" }}>Votre stock local est invisible.</em>
                </motion.p>
            </div>
        </section>
    );
}

/* ── How ─────────────────────────────────────────────────────────────── */

function How() {
    const isMobile = useIsMobile();
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });

    const steps = [
        {
            num: "01",
            title: "On se connecte à votre caisse et vos fournisseurs",
            desc: "Two-Step lit votre caisse automatiquement. Vos factures fournisseurs arrivent par email ? On les détecte et on met votre catalogue à jour. Zéro saisie.",
            bg: "#EDE0C4", numColor: "rgba(44,32,24,0.1)", titleColor: "#2C2018", descColor: "#6B4F38",
        },
        {
            num: "02",
            title: "Votre stock devient visible en temps réel",
            desc: "Les consommateurs de votre quartier voient exactement ce que vous avez en boutique. Pas un site e-commerce — vos vrais produits, votre vraie disponibilité.",
            bg: "#2C2018", numColor: "#C8813A", titleColor: "#F5EDD6", descColor: "rgba(245,237,214,0.6)",
        },
        {
            num: "03",
            title: "Ils viennent chez vous",
            desc: "Pas de livraison, pas de commission sur vos ventes. Le client cherche, il vous trouve, il pousse votre porte. Les boutiques en ligne perdent une vente et vous en gagnez une.",
            bg: "#C8813A", numColor: "rgba(245,237,214,0.18)", titleColor: "#F5EDD6", descColor: "rgba(245,237,214,0.8)",
        },
    ];

    return (
        <section id="comment" ref={ref} style={{ background: "#F5EDD6", padding: isMobile ? "80px 24px" : "120px 48px" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                <motion.div
                    initial={{ opacity: 0, y: 32 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, ease: E }}
                    style={{ marginBottom: 56 }}
                >
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#C8813A", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16 }}>
                        Comment ça marche
                    </div>
                    <h2 style={{
                        fontSize: isMobile ? "clamp(32px, 8vw, 48px)" : "clamp(36px, 5vw, 64px)",
                        fontWeight: 800, color: "#2C2018", lineHeight: 1.06,
                        letterSpacing: "-0.03em", margin: 0, maxWidth: 560,
                    }}>
                        Branché. Visible.{" "}
                        <em style={{ fontStyle: "italic", color: "#C8813A" }}>Vendu.</em>
                    </h2>
                </motion.div>

                <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
                    gap: 16,
                }}>
                    {steps.map((step, i) => (
                        <motion.div
                            key={step.num}
                            initial={{ opacity: 0, y: 48 }}
                            animate={inView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.75, delay: isMobile ? 0 : i * 0.13, ease: E }}
                            whileHover={{ y: -6, transition: { duration: 0.25 } }}
                            style={{
                                background: step.bg,
                                borderRadius: 24,
                                padding: "40px 36px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 18,
                            }}
                        >
                            <span style={{ fontSize: 52, fontWeight: 900, color: step.numColor, lineHeight: 1, letterSpacing: "-0.04em" }}>
                                {step.num}
                            </span>
                            <div>
                                <h3 style={{ fontSize: 17, fontWeight: 700, color: step.titleColor, lineHeight: 1.3, letterSpacing: "-0.02em", margin: "0 0 10px" }}>
                                    {step.title}
                                </h3>
                                <p style={{ fontSize: 14, color: step.descColor, lineHeight: 1.65, margin: 0 }}>
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
    const isMobile = useIsMobile();
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });

    return (
        <section ref={ref} style={{ background: "#EDE0C4", padding: isMobile ? "80px 24px" : "120px 48px" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: isMobile ? 40 : 80,
                    alignItems: "center",
                }}>
                    <motion.div
                        initial={{ opacity: 0, x: isMobile ? 0 : -40, y: isMobile ? 24 : 0 }}
                        animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
                        transition={{ duration: 0.8, ease: E }}
                    >
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#C8813A", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 20 }}>
                            À propos
                        </div>
                        <h2 style={{
                            fontSize: isMobile ? "clamp(32px, 8vw, 48px)" : "clamp(36px, 5.5vw, 68px)",
                            fontWeight: 800, color: "#2C2018", lineHeight: 1.05,
                            letterSpacing: "-0.03em", margin: 0,
                        }}>
                            Nés à Toulouse,
                            <br />
                            <em style={{ fontStyle: "italic", color: "#C8813A" }}>fondateurs</em>
                            <br />
                            de Two-Step.
                        </h2>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: isMobile ? 0 : 40, y: isMobile ? 24 : 0 }}
                        animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
                        transition={{ duration: 0.8, delay: 0.15, ease: E }}
                    >
                        <p style={{ fontSize: isMobile ? 15 : 17, color: "#2C2018", lineHeight: 1.72, margin: "0 0 20px" }}>
                            Deux frères qui ont vu leurs commerçants préférés perdre des ventes au profit des boutiques en ligne — non pas parce que les clients préféraient commander en ligne, mais parce qu'ils ne savaient pas que le produit exact existait en boutique, à deux pas de chez eux.
                        </p>
                        <p style={{ fontSize: isMobile ? 15 : 17, color: "#6B4F38", lineHeight: 1.72, margin: 0 }}>
                            Two-Step, c'est l'outil que les commerçants locaux n'avaient pas encore.
                        </p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

/* ── Free for pioneers ──────────────────────────────────────────────── */

function FreePioneers() {
    const isMobile = useIsMobile();
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });

    return (
        <section ref={ref} style={{
            background: "#2C2018",
            padding: isMobile ? "80px 24px" : "120px 48px",
            position: "relative",
            overflow: "hidden",
        }}>
            <div style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(ellipse at 30% 50%, rgba(200,129,58,0.12) 0%, transparent 60%)",
                pointerEvents: "none",
            }} />
            <div style={{ maxWidth: 800, margin: "0 auto", position: "relative", textAlign: "center" }}>
                <motion.div
                    initial={{ opacity: 0, y: 32 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, ease: E }}
                >
                    <div style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 28,
                        padding: "6px 16px",
                        borderRadius: 999,
                        background: "rgba(200, 129, 58, 0.15)",
                        border: "1px solid rgba(200, 129, 58, 0.3)",
                    }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#C8813A", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            Lancement Toulouse
                        </span>
                    </div>
                </motion.div>

                <motion.h2
                    initial={{ opacity: 0, y: 28 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.8, delay: 0.1, ease: E }}
                    style={{
                        fontSize: isMobile ? "clamp(32px, 8vw, 48px)" : "clamp(36px, 5vw, 64px)",
                        fontWeight: 800,
                        color: "#F5EDD6",
                        lineHeight: 1.08,
                        letterSpacing: "-0.03em",
                        margin: "0 0 24px",
                    }}
                >
                    Gratuit pour les{" "}
                    <em style={{ fontStyle: "italic", color: "#C8813A" }}>30 premiers.</em>
                </motion.h2>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, delay: 0.2, ease: E }}
                    style={{
                        fontSize: isMobile ? 16 : 18,
                        color: "rgba(245,237,214,0.65)",
                        lineHeight: 1.7,
                        margin: "0 auto 40px",
                        maxWidth: 560,
                    }}
                >
                    Pas pendant un mois. Pas pendant un trimestre.{" "}
                    <strong style={{ color: "#F5EDD6" }}>
                        Tant que Two-Step n'a pas prouvé sa valeur.
                    </strong>{" "}
                    Vous ne payez que quand 1 000 utilisateurs à Toulouse utilisent la plateforme. Zéro risque.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.6, delay: 0.35, ease: E }}
                    style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
                        gap: 16,
                    }}
                >
                    {[
                        { icon: "🔌", title: "Connexion automatique", desc: "On se branche sur votre caisse et vos emails fournisseurs" },
                        { icon: "📦", title: "Stock toujours à jour", desc: "Entrées par facture, sorties par vente — sans rien toucher" },
                        { icon: "🚫", title: "Aucune commission", desc: "Pas de % sur vos ventes. Abonnement fixe, uniquement quand ça marche" },
                    ].map((item, i) => (
                        <motion.div
                            key={item.title}
                            initial={{ opacity: 0, y: 24 }}
                            animate={inView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.6, delay: 0.4 + i * 0.1, ease: E }}
                            style={{
                                background: "rgba(245,237,214,0.06)",
                                borderRadius: 20,
                                padding: "28px 24px",
                                border: "1px solid rgba(245,237,214,0.08)",
                            }}
                        >
                            <div style={{ fontSize: 28, marginBottom: 14 }}>{item.icon}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#F5EDD6", marginBottom: 8, lineHeight: 1.3 }}>
                                {item.title}
                            </div>
                            <div style={{ fontSize: 13, color: "rgba(245,237,214,0.5)", lineHeight: 1.6 }}>
                                {item.desc}
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}

/* ── Contact ─────────────────────────────────────────────────────────── */

function Contact() {
    const isMobile = useIsMobile();
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
        <section id="contact" ref={ref} style={{ background: "#F5EDD6", padding: isMobile ? "80px 24px" : "120px 48px" }}>
            <div style={{ maxWidth: 580, margin: "0 auto" }}>
                <motion.div
                    initial={{ opacity: 0, y: 32 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, ease: E }}
                    style={{ marginBottom: 48 }}
                >
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#C8813A", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16 }}>
                        Vous êtes commerçant à Toulouse ?
                    </div>
                    <h2 style={{
                        fontSize: isMobile ? "clamp(30px, 8vw, 44px)" : "clamp(32px, 4.5vw, 56px)",
                        fontWeight: 800, color: "#2C2018", lineHeight: 1.08,
                        letterSpacing: "-0.03em", margin: 0,
                    }}>
                        Rejoignez les{" "}
                        <em style={{ fontStyle: "italic", color: "#C8813A" }}>pionniers.</em>
                    </h2>
                </motion.div>

                {status === "sent" ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.93 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{ padding: "48px", borderRadius: 24, background: "#2C2018", textAlign: "center" }}
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
                            style={{
                                width: 52, height: 52, borderRadius: "50%",
                                background: "#C8813A",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                margin: "0 auto 20px", fontSize: 20, color: "#fff", fontWeight: 700,
                            }}
                        >
                            ✓
                        </motion.div>
                        <p style={{ color: "#F5EDD6", fontWeight: 600, fontSize: 17, margin: 0 }}>
                            Message reçu. On vous contacte sous 48h.
                        </p>
                    </motion.div>
                ) : (
                    <motion.form
                        onSubmit={handleSubmit}
                        initial={{ opacity: 0, y: 24 }}
                        animate={inView ? { opacity: 1, y: 0 } : {}}
                        transition={{ duration: 0.7, delay: 0.15, ease: E }}
                        style={{ display: "flex", flexDirection: "column", gap: 28 }}
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
                                transition={{ duration: 0.5, delay: 0.22 + i * 0.09, ease: E }}
                                style={{ display: "flex", flexDirection: "column", gap: 8 }}
                            >
                                <label style={{ fontSize: 10, fontWeight: 700, color: "#C8813A", letterSpacing: "0.12em", textTransform: "uppercase" }}>
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
                                        fontSize: 16,
                                        fontFamily: "inherit",
                                        color: "#2C2018",
                                        outline: "none",
                                        transition: "border-color 0.2s",
                                    }}
                                    onFocus={(e) => { e.target.style.borderBottomColor = "#C8813A"; }}
                                    onBlur={(e) => { e.target.style.borderBottomColor = "rgba(44,32,24,0.18)"; }}
                                />
                            </motion.div>
                        ))}

                        <motion.button
                            type="submit"
                            disabled={status === "sending"}
                            whileHover={{ scale: 1.04, boxShadow: "0 10px 36px rgba(44,32,24,0.25)" }}
                            whileTap={{ scale: 0.97 }}
                            style={{
                                marginTop: 8,
                                padding: "17px 36px",
                                borderRadius: 999,
                                background: "#2C2018",
                                color: "#F5EDD6",
                                fontWeight: 700,
                                fontSize: 15,
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
                                Une erreur s'est produite. Écrivez-nous à{" "}
                                <a href="mailto:contact@twostep.fr" style={{ color: "#C8813A" }}>contact@twostep.fr</a>
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
    const isMobile = useIsMobile();
    return (
        <footer style={{
            background: "#2C2018",
            padding: isMobile ? "32px 24px" : "40px 48px",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: isMobile ? 8 : 0,
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src="/logo-icon.webp" alt="" style={{ height: 28, width: 28, borderRadius: 6 }} />
                <span style={{ fontSize: 17, fontWeight: 800, color: "#F5EDD6", letterSpacing: "-0.03em" }}>
                    Two-Step
                </span>
            </div>
            <span style={{ fontSize: 13, color: "rgba(245,237,214,0.38)" }}>
                © 2026 · Toulouse, France
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
                <FreePioneers />
                <Contact />
            </main>
            <Footer />
        </>
    );
}

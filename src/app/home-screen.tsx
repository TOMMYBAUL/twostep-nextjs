"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";

/* ══════════════════════════════════════════════
   TWO-STEP — Editorial Landing Page
   Inspired by: bold typography, editorial layouts,
   generous negative space, strong contrasts
   ══════════════════════════════════════════════ */

const Logo = () => (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <ellipse cx="9" cy="17" rx="4.5" ry="6.5" transform="rotate(-12 9 17)" fill="#C8813A" />
        <ellipse cx="19" cy="12" rx="4.5" ry="6.5" transform="rotate(10 19 12)" fill="#2C2018" />
    </svg>
);

/* ── Reveal on scroll ── */
const useReveal = () => {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);
    return { ref, visible };
};

/* ══ NAV ══ */
const Nav = () => (
    <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "24px 48px",
        mixBlendMode: "normal",
    }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <Logo />
            <span style={{ fontSize: 16, fontWeight: 800, color: "#2C2018", letterSpacing: "-0.3px" }}>
                two<span style={{ color: "#C8813A" }}>-</span>step
            </span>
        </a>
        <a
            href="#contact"
            onClick={(e) => { e.preventDefault(); document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }); }}
            style={{
                fontSize: 13, fontWeight: 600, color: "#2C2018",
                textDecoration: "none", letterSpacing: "0.5px",
                borderBottom: "1.5px solid #C8813A", paddingBottom: 2,
                transition: "color 0.2s",
            }}
        >
            Être contacté →
        </a>
    </nav>
);

/* ══ HERO ══ */
const Hero = () => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setTimeout(() => setMounted(true), 100); }, []);

    return (
        <section style={{
            minHeight: "100vh",
            padding: "0 48px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
        }}>
            {/* Background watermark number */}
            <span style={{
                position: "absolute", right: -20, top: "50%", transform: "translateY(-50%)",
                fontSize: "clamp(200px, 25vw, 380px)", fontWeight: 900,
                color: "rgba(200,129,58,0.06)", lineHeight: 1, userSelect: "none",
                letterSpacing: "-10px",
            }}>TS</span>

            <div style={{ maxWidth: 1100, position: "relative", zIndex: 1 }}>
                {/* Eyebrow */}
                <div style={{
                    display: "flex", alignItems: "center", gap: 12, marginBottom: 40,
                    opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(16px)",
                    transition: "opacity 0.8s ease, transform 0.8s ease",
                }}>
                    <div style={{ width: 32, height: 1.5, background: "#C8813A" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "#C8813A" }}>
                        Toulouse · 2026
                    </span>
                </div>

                {/* First line — smaller, calm */}
                <p style={{
                    fontSize: "clamp(20px, 2.5vw, 32px)", fontWeight: 500,
                    color: "#6B4F38", lineHeight: 1.3, marginBottom: 8,
                    opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(24px)",
                    transition: "opacity 0.8s ease 0.1s, transform 0.8s ease 0.1s",
                }}>
                    Vos clients veulent acheter chez vous.
                </p>

                {/* Main line — massive, ochre */}
                <h1 style={{
                    fontSize: "clamp(52px, 8vw, 120px)", fontWeight: 900,
                    color: "#C8813A", lineHeight: 0.95, letterSpacing: "-3px",
                    marginBottom: 48,
                    opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(32px)",
                    transition: "opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s",
                }}>
                    Ils finissent<br />sur Amazon.
                </h1>

                {/* Sub + CTA */}
                <div style={{
                    display: "flex", alignItems: "flex-end", gap: 80, flexWrap: "wrap",
                    opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(20px)",
                    transition: "opacity 0.8s ease 0.4s, transform 0.8s ease 0.4s",
                }}>
                    <p style={{ fontSize: 16, color: "#6B4F38", lineHeight: 1.75, maxWidth: 400 }}>
                        Two-Step rend votre stock visible aux consommateurs de votre quartier —
                        en temps réel, sans rien changer à votre façon de travailler.
                    </p>
                    <a
                        href="#contact"
                        onClick={(e) => { e.preventDefault(); document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }); }}
                        style={{
                            display: "inline-flex", alignItems: "center", gap: 12,
                            background: "#2C2018", color: "#F5EDD6",
                            padding: "18px 36px", borderRadius: 4,
                            fontSize: 14, fontWeight: 700, textDecoration: "none",
                            letterSpacing: "0.5px", whiteSpace: "nowrap",
                            transition: "background 0.2s, transform 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#C8813A"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#2C2018"; e.currentTarget.style.transform = "none"; }}
                    >
                        Prendre contact →
                    </a>
                </div>
            </div>

            {/* Hero illustration — bottom right */}
            <div style={{
                position: "absolute", right: 48, bottom: 0,
                width: "clamp(280px, 38%, 500px)",
                opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(40px)",
                transition: "opacity 1s ease 0.5s, transform 1s ease 0.5s",
            }}>
                <Image
                    src="/hero.png"
                    alt="Deux amis découvrant une boutique locale"
                    width={500}
                    height={380}
                    style={{ width: "100%", height: "auto", borderRadius: "12px 12px 0 0" }}
                    priority
                />
            </div>

            {/* Scroll indicator */}
            <div style={{
                position: "absolute", bottom: 32, left: 48,
                display: "flex", alignItems: "center", gap: 8,
                opacity: mounted ? 0.5 : 0, transition: "opacity 1s ease 1s",
            }}>
                <div style={{ width: 1, height: 40, background: "#2C2018" }} />
                <span style={{ fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", color: "#2C2018" }}>Scroll</span>
            </div>
        </section>
    );
};

/* ══ STATEMENT — full dark section ══ */
const Statement = () => {
    const { ref, visible } = useReveal();
    return (
        <section style={{ background: "#2C2018", padding: "120px 48px", overflow: "hidden" }}>
            <div ref={ref} style={{ maxWidth: 1000, margin: "0 auto" }}>
                <div style={{
                    fontSize: "clamp(14px, 1.5vw, 18px)", fontWeight: 600,
                    color: "rgba(245,237,214,0.4)", letterSpacing: "3px", textTransform: "uppercase",
                    marginBottom: 64, display: "flex", alignItems: "center", gap: 16,
                }}>
                    <span>Le constat</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(245,237,214,0.1)" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "end", marginBottom: 80 }}>
                    <div style={{
                        opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(32px)",
                        transition: "opacity 0.8s ease, transform 0.8s ease",
                    }}>
                        <div style={{ fontSize: "clamp(80px, 12vw, 160px)", fontWeight: 900, color: "#C8813A", lineHeight: 1, letterSpacing: "-4px" }}>70%</div>
                        <div style={{ fontSize: 16, color: "rgba(245,237,214,0.6)", marginTop: 16, lineHeight: 1.6 }}>
                            des Français achètent en ligne régulièrement
                        </div>
                    </div>
                    <div style={{
                        opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(32px)",
                        transition: "opacity 0.8s ease 0.15s, transform 0.8s ease 0.15s",
                    }}>
                        <div style={{ fontSize: "clamp(80px, 12vw, 160px)", fontWeight: 900, color: "#C8813A", lineHeight: 1, letterSpacing: "-4px" }}>79%</div>
                        <div style={{ fontSize: 16, color: "rgba(245,237,214,0.6)", marginTop: 16, lineHeight: 1.6 }}>
                            disent préférer acheter local
                        </div>
                    </div>
                </div>

                <div style={{
                    borderTop: "1px solid rgba(245,237,214,0.08)", paddingTop: 48,
                    opacity: visible ? 1 : 0, transition: "opacity 0.8s ease 0.3s",
                }}>
                    <p style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 700, color: "#F5EDD6", lineHeight: 1.4, maxWidth: 700 }}>
                        Vos clients veulent acheter chez vous.
                        Le problème : <span style={{ color: "#C8813A" }}>ils ne savent pas que vous avez ce qu'ils cherchent.</span>
                    </p>
                    <p style={{ fontSize: 12, color: "rgba(245,237,214,0.25)", marginTop: 16, letterSpacing: "1px" }}>
                        FEVAD 2023 · OPINIONWAY
                    </p>
                </div>
            </div>
        </section>
    );
};

/* ══ HOW — editorial numbered list ══ */
const steps = [
    { n: "01", title: "Connexion à votre caisse", desc: "Lightspeed, Zettle, SumUp, Tiller… Two-Step lit vos transactions via API. Rien ne change pour vous." },
    { n: "02", title: "Votre stock en temps réel", desc: "Chaque produit disponible chez vous apparaît instantanément sur Two-Step — pour vos voisins, maintenant." },
    { n: "03", title: "Vos clients reviennent", desc: "Ils cherchent. Ils vous trouvent. Ils viennent. La boucle vertueuse du commerce local se remet en marche." },
];

const How = () => {
    const { ref, visible } = useReveal();
    return (
        <section id="comment" style={{ padding: "120px 48px", background: "#F5EDD6" }}>
            <div ref={ref} style={{ maxWidth: 1000, margin: "0 auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 96, flexWrap: "wrap", gap: 32 }}>
                    <h2 style={{
                        fontSize: "clamp(36px, 5vw, 72px)", fontWeight: 900,
                        color: "#2C2018", letterSpacing: "-2px", lineHeight: 1.05,
                        opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(24px)",
                        transition: "opacity 0.8s ease, transform 0.8s ease",
                    }}>
                        Trois étapes.<br />
                        <span style={{ color: "#C8813A" }}>Zéro friction.</span>
                    </h2>
                    <p style={{
                        fontSize: 15, color: "#6B4F38", lineHeight: 1.75, maxWidth: 320, paddingTop: 16,
                        opacity: visible ? 1 : 0, transition: "opacity 0.8s ease 0.2s",
                    }}>
                        Two-Step se branche en silence sur votre outil actuel. Vous ne changez rien, vos clients vous trouvent enfin.
                    </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {steps.map((step, i) => (
                        <div
                            key={step.n}
                            style={{
                                display: "grid", gridTemplateColumns: "80px 1fr",
                                gap: 48, padding: "48px 0",
                                borderTop: "1px solid rgba(44,32,24,0.1)",
                                opacity: visible ? 1 : 0,
                                transform: visible ? "none" : "translateY(24px)",
                                transition: `opacity 0.7s ease ${0.1 + i * 0.12}s, transform 0.7s ease ${0.1 + i * 0.12}s`,
                            }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#C8813A", letterSpacing: "1px", paddingTop: 6 }}>
                                {step.n}
                            </div>
                            <div>
                                <h3 style={{ fontSize: "clamp(20px, 2.5vw, 28px)", fontWeight: 800, color: "#2C2018", marginBottom: 12, letterSpacing: "-0.5px" }}>
                                    {step.title}
                                </h3>
                                <p style={{ fontSize: 15, color: "#6B4F38", lineHeight: 1.75, maxWidth: 560 }}>
                                    {step.desc}
                                </p>
                            </div>
                        </div>
                    ))}
                    <div style={{ borderTop: "1px solid rgba(44,32,24,0.1)" }} />
                </div>
            </div>
        </section>
    );
};

/* ══ ABOUT ══ */
const About = () => {
    const { ref, visible } = useReveal();
    return (
        <section style={{ background: "#EDE0C4", padding: "120px 48px" }}>
            <div ref={ref} style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 96, alignItems: "center" }}>
                <div style={{
                    opacity: visible ? 1 : 0, transform: visible ? "none" : "translateX(-32px)",
                    transition: "opacity 0.9s ease, transform 0.9s ease",
                }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "#C8813A", marginBottom: 32 }}>
                        Qui on est
                    </div>
                    <h2 style={{ fontSize: "clamp(32px, 4vw, 56px)", fontWeight: 900, color: "#2C2018", lineHeight: 1.1, letterSpacing: "-1.5px", marginBottom: 32 }}>
                        Deux frères.<br />Une mission.
                    </h2>
                    <p style={{ fontSize: 16, color: "#6B4F38", lineHeight: 1.8, marginBottom: 20 }}>
                        On a grandi à Toulouse. On a vu des boutiques qu'on adorait fermer — non pas parce que leurs produits étaient mauvais, mais parce que personne ne savait qu'elles existaient encore.
                    </p>
                    <p style={{ fontSize: 16, color: "#6B4F38", lineHeight: 1.8 }}>
                        Two-Step, c'est notre réponse à ça. Rendre le commerce local aussi facile à trouver qu'une commande Amazon. Sans changer ce qui fait son âme.
                    </p>
                </div>

                <div style={{
                    opacity: visible ? 1 : 0, transform: visible ? "none" : "translateX(32px)",
                    transition: "opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s",
                }}>
                    <div style={{ background: "#2C2018", borderRadius: 4, padding: 48 }}>
                        <div style={{ fontSize: "clamp(40px, 6vw, 80px)", fontWeight: 900, color: "#C8813A", lineHeight: 1, letterSpacing: "-3px", marginBottom: 24 }}>
                            bauland
                        </div>
                        <div style={{ width: 40, height: 2, background: "#C8813A", marginBottom: 24 }} />
                        <p style={{ fontSize: 14, color: "rgba(245,237,214,0.6)", lineHeight: 1.7 }}>
                            Projet fondé à Toulouse.<br />
                            100% digital · Zéro hardware.<br />
                            Lancement 2026.
                        </p>
                        <div style={{ marginTop: 32, paddingTop: 32, borderTop: "1px solid rgba(245,237,214,0.1)" }}>
                            <a href="mailto:bauland@twostep.fr" style={{ fontSize: 13, color: "#C8813A", textDecoration: "none", fontWeight: 600, letterSpacing: "0.5px" }}>
                                bauland@twostep.fr →
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

/* ══ CONTACT ══ */
const Contact = () => {
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const { ref, visible } = useReveal();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch("https://formspree.io/f/xlgpapze", {
                method: "POST",
                body: new FormData(e.currentTarget),
                headers: { Accept: "application/json" },
            });
            if (res.ok) setSubmitted(true);
        } finally {
            setLoading(false);
        }
    };

    const fieldStyle: React.CSSProperties = {
        width: "100%", padding: "16px 0",
        border: "none", borderBottom: "1.5px solid rgba(44,32,24,0.15)",
        background: "transparent", fontFamily: "inherit",
        fontSize: 16, color: "#2C2018", outline: "none",
        transition: "border-color 0.2s",
    };

    return (
        <section id="contact" style={{ background: "#F5EDD6", padding: "120px 48px" }}>
            <div ref={ref} style={{ maxWidth: 800, margin: "0 auto" }}>
                <div style={{
                    opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(24px)",
                    transition: "opacity 0.8s ease, transform 0.8s ease",
                }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "#C8813A", marginBottom: 24 }}>
                        Phase de lancement
                    </div>
                    <h2 style={{ fontSize: "clamp(36px, 5vw, 72px)", fontWeight: 900, color: "#2C2018", lineHeight: 1.05, letterSpacing: "-2px", marginBottom: 24 }}>
                        On cherche des<br />
                        <span style={{ color: "#C8813A" }}>commerçants pionniers.</span>
                    </h2>
                    <p style={{ fontSize: 16, color: "#6B4F38", lineHeight: 1.75, maxWidth: 480, marginBottom: 72 }}>
                        20 minutes, un café, votre avis. Pas d'engagement — juste une conversation entre humains.
                    </p>

                    {submitted ? (
                        <div style={{ padding: "64px 0", textAlign: "center" }}>
                            <div style={{ fontSize: 56, marginBottom: 24 }}>🎉</div>
                            <h3 style={{ fontSize: 28, fontWeight: 800, color: "#2C2018", marginBottom: 8, letterSpacing: "-0.5px" }}>Message reçu.</h3>
                            <p style={{ fontSize: 16, color: "#6B4F38" }}>On revient vers vous très vite pour fixer un café.</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 0 }}>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#C8813A" }}>Prénom</label>
                                    <input name="name" type="text" placeholder="Marie" required style={fieldStyle}
                                        onFocus={(e) => e.target.style.borderBottomColor = "#C8813A"}
                                        onBlur={(e) => e.target.style.borderBottomColor = "rgba(44,32,24,0.15)"}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#C8813A" }}>Email</label>
                                    <input name="email" type="email" placeholder="marie@laboutique.fr" required style={fieldStyle}
                                        onFocus={(e) => e.target.style.borderBottomColor = "#C8813A"}
                                        onBlur={(e) => e.target.style.borderBottomColor = "rgba(44,32,24,0.15)"}
                                    />
                                </div>
                            </div>
                            <div style={{ marginTop: 32 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#C8813A" }}>Nom de votre boutique</label>
                                <input name="shop" type="text" placeholder="La Librairie du Coin" required style={fieldStyle}
                                    onFocus={(e) => e.target.style.borderBottomColor = "#C8813A"}
                                    onBlur={(e) => e.target.style.borderBottomColor = "rgba(44,32,24,0.15)"}
                                />
                            </div>
                            <div style={{ marginTop: 32, marginBottom: 56 }}>
                                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#C8813A" }}>Ville</label>
                                <input name="city" type="text" placeholder="Toulouse" required style={fieldStyle}
                                    onFocus={(e) => e.target.style.borderBottomColor = "#C8813A"}
                                    onBlur={(e) => e.target.style.borderBottomColor = "rgba(44,32,24,0.15)"}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    background: "#2C2018", color: "#F5EDD6",
                                    border: "none", padding: "20px 48px",
                                    borderRadius: 4, fontFamily: "inherit",
                                    fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                                    letterSpacing: "0.5px", transition: "background 0.2s, transform 0.2s",
                                    opacity: loading ? 0.7 : 1,
                                }}
                                onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = "#C8813A"; e.currentTarget.style.transform = "translateY(-2px)"; } }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "#2C2018"; e.currentTarget.style.transform = "none"; }}
                            >
                                {loading ? "Envoi…" : "Je veux être contacté →"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </section>
    );
};

/* ══ FOOTER ══ */
const Footer = () => (
    <footer style={{ background: "#2C2018", padding: "48px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo />
            <span style={{ fontSize: 16, fontWeight: 800, color: "#F5EDD6", letterSpacing: "-0.3px" }}>
                two<span style={{ color: "#C8813A" }}>-</span>step
            </span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(245,237,214,0.35)", textAlign: "right", lineHeight: 1.7 }}>
            <a href="mailto:bauland@twostep.fr" style={{ color: "rgba(245,237,214,0.5)", textDecoration: "none" }}>
                bauland@twostep.fr
            </a>
            <br />Toulouse · 2026
        </div>
    </footer>
);

/* ══ ROOT ══ */
export const HomeScreen = () => (
    <main style={{ background: "#F5EDD6" }}>
        <Nav />
        <Hero />
        <Statement />
        <How />
        <About />
        <Contact />
        <Footer />
    </main>
);

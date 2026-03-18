"use client";

import Image from "next/image";
import { useState, useEffect } from "react";

const ts = {
    cream: "#F5EDD6",
    creamDark: "#EDE0C4",
    ochre: "#C8813A",
    ochreDark: "#A86828",
    sage: "#7A9E7E",
    brown: "#2C2018",
    brownMid: "#6B4F38",
};

/* ── Logo SVG ── */
const Logo = ({ size = 36 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
        <ellipse cx="11" cy="22" rx="5.5" ry="8" transform="rotate(-12 11 22)" fill={ts.ochre} />
        <ellipse cx="23" cy="15" rx="5.5" ry="8" transform="rotate(10 23 15)" fill={ts.brown} />
    </svg>
);

/* ── Navbar ── */
const Navbar = ({ scrolled }: { scrolled: boolean }) => (
    <nav
        style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 64px",
            background: `rgba(245, 237, 214, ${scrolled ? "0.95" : "0.85"})`,
            backdropFilter: "blur(12px)",
            borderBottom: `1px solid rgba(44, 32, 24, ${scrolled ? "0.08" : "0.04"})`,
            transition: "all 0.3s ease",
        }}
    >
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <Logo size={36} />
            <span style={{ fontSize: 20, fontWeight: 800, color: ts.brown, letterSpacing: "-0.5px" }}>
                <span style={{ color: ts.ochre }}>two</span>-step
            </span>
        </a>
        <a
            href="#contact"
            onClick={(e) => { e.preventDefault(); document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }); }}
            style={{
                background: ts.brown,
                color: ts.cream,
                padding: "12px 24px",
                borderRadius: 100,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = ts.ochre)}
            onMouseLeave={(e) => (e.currentTarget.style.background = ts.brown)}
        >
            Nous contacter
        </a>
    </nav>
);

/* ── Hero ── */
const Hero = () => (
    <section
        style={{
            minHeight: "100vh",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            alignItems: "center",
            gap: 48,
            padding: "120px 64px 80px",
            maxWidth: 1280,
            margin: "0 auto",
        }}
    >
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
                <div style={{ width: 24, height: 2, background: ts.ochre, borderRadius: 2 }} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: ts.ochre }}>
                    Toulouse · Lancement 2026
                </span>
            </div>

            <h1
                style={{
                    fontSize: "clamp(32px, 3.5vw, 52px)",
                    fontWeight: 800,
                    lineHeight: 1.15,
                    letterSpacing: "-1px",
                    color: ts.brown,
                    marginBottom: 24,
                }}
            >
                Vos clients veulent acheter chez vous.{" "}
                <em style={{ fontStyle: "normal", color: ts.ochre }}>Ils finissent sur Amazon.</em>
            </h1>

            <p style={{ fontSize: 17, color: ts.brownMid, lineHeight: 1.75, marginBottom: 40, maxWidth: 480 }}>
                Two-Step rend votre stock visible aux consommateurs de votre quartier — en temps réel,
                sans site e-commerce, sans livraison, sans changer quoi que ce soit à votre façon de travailler.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <a
                    href="#contact"
                    onClick={(e) => { e.preventDefault(); document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }); }}
                    style={{
                        background: ts.ochre,
                        color: "white",
                        padding: "16px 32px",
                        borderRadius: 100,
                        fontSize: 15,
                        fontWeight: 700,
                        textDecoration: "none",
                        display: "inline-block",
                        transition: "background 0.2s, transform 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = ts.ochreDark; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ts.ochre; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                    Je veux être contacté →
                </a>
                <a
                    href="#comment"
                    onClick={(e) => { e.preventDefault(); document.getElementById("comment")?.scrollIntoView({ behavior: "smooth" }); }}
                    style={{ fontSize: 14, fontWeight: 600, color: ts.brownMid, textDecoration: "none" }}
                >
                    Comment ça marche →
                </a>
            </div>
        </div>

        <div style={{ position: "relative" }}>
            <Image
                src="/hero.png"
                alt="Deux amis découvrant une boutique locale"
                width={640}
                height={480}
                style={{ width: "100%", height: "auto", borderRadius: 24, boxShadow: `0 24px 64px rgba(44, 32, 24, 0.14)` }}
                priority
            />
            <div
                style={{
                    position: "absolute",
                    bottom: -20,
                    left: -20,
                    background: "white",
                    borderRadius: 16,
                    padding: "16px 20px",
                    boxShadow: "0 8px 32px rgba(44,32,24,0.12)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                }}
            >
                <div style={{ width: 40, height: 40, background: ts.cream, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    📍
                </div>
                <div>
                    <strong style={{ display: "block", fontSize: 15, fontWeight: 700, color: ts.brown }}>Commerce local</strong>
                    <span style={{ fontSize: 12, color: ts.brownMid }}>Visible en temps réel</span>
                </div>
            </div>
        </div>
    </section>
);

/* ── Stats ── */
const Stats = () => (
    <section style={{ background: ts.brown, padding: "80px 64px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", alignItems: "center" }}>
                <div style={{ textAlign: "center", padding: "0 64px" }}>
                    <div style={{ fontSize: "clamp(48px, 6vw, 72px)", fontWeight: 800, letterSpacing: "-2px", color: ts.ochre, lineHeight: 1, marginBottom: 8 }}>70%</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: "rgba(245,237,214,0.7)", lineHeight: 1.5 }}>des Français achètent<br />en ligne régulièrement</div>
                </div>
                <div style={{ background: "rgba(245,237,214,0.12)", height: 80, width: 1 }} />
                <div style={{ textAlign: "center", padding: "0 64px" }}>
                    <div style={{ fontSize: "clamp(48px, 6vw, 72px)", fontWeight: 800, letterSpacing: "-2px", color: ts.ochre, lineHeight: 1, marginBottom: 8 }}>79%</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: "rgba(245,237,214,0.7)", lineHeight: 1.5 }}>disent préférer<br />acheter local</div>
                </div>
            </div>
            <div style={{ borderTop: "1px solid rgba(245,237,214,0.1)", marginTop: 40, paddingTop: 40, textAlign: "center" }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: ts.cream, lineHeight: 1.5 }}>
                    Vos clients veulent acheter chez vous.<br />
                    Le problème : <span style={{ color: ts.ochre }}>ils ne savent pas que vous avez ce qu'ils cherchent.</span>
                </p>
                <p style={{ fontSize: 11, color: "rgba(245,237,214,0.3)", marginTop: 12, letterSpacing: "1px" }}>
                    Sources : FEVAD 2023 · OpinionWay
                </p>
            </div>
        </div>
    </section>
);

/* ── How it works ── */
const steps = [
    { n: "01", icon: "🔌", title: "On se connecte à votre caisse", desc: "Lightspeed, Zettle, SumUp, Clyo, Tiller… Two-Step lit vos transactions via API. Vous ne changez rien à votre processus." },
    { n: "02", icon: "📦", title: "Votre stock devient visible", desc: "En temps réel, les produits que vous avez en stock apparaissent sur Two-Step pour les consommateurs de votre quartier." },
    { n: "03", icon: "🚶", title: "Vos clients viennent chez vous", desc: "Ils tapent \"sneakers blanches Toulouse\" — ils voient votre boutique. Ils viennent. Amazon perd une vente." },
];

const HowItWorks = () => (
    <section id="comment" style={{ padding: "120px 64px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 72 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: ts.ochre, marginBottom: 16 }}>
                Comment ça marche
            </div>
            <h2 style={{ fontSize: "clamp(28px, 3vw, 44px)", fontWeight: 800, letterSpacing: "-0.8px", color: ts.brown, marginBottom: 16, lineHeight: 1.2 }}>
                Trois étapes.<br />Zéro friction.
            </h2>
            <p style={{ fontSize: 16, color: ts.brownMid, maxWidth: 480, lineHeight: 1.7 }}>
                Two-Step se branche sur votre caisse existante. Vous continuez à travailler exactement comme avant.
            </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
            {steps.map((step) => (
                <div
                    key={step.n}
                    style={{
                        background: "white",
                        borderRadius: 20,
                        padding: "40px 32px",
                        border: `1px solid rgba(44,32,24,0.06)`,
                        transition: "transform 0.3s, box-shadow 0.3s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 16px 48px rgba(44,32,24,0.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                    <div style={{ fontSize: 48, fontWeight: 800, color: ts.creamDark, lineHeight: 1, marginBottom: 20, letterSpacing: "-2px" }}>{step.n}</div>
                    <div style={{ width: 52, height: 52, background: ts.cream, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, marginBottom: 20 }}>
                        {step.icon}
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: ts.brown, marginBottom: 12 }}>{step.title}</h3>
                    <p style={{ fontSize: 14, color: ts.brownMid, lineHeight: 1.7 }}>{step.desc}</p>
                </div>
            ))}
        </div>
    </section>
);

/* ── About ── */
const About = () => (
    <section style={{ background: ts.creamDark, padding: "120px 64px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
            <div style={{ background: ts.brown, borderRadius: 24, padding: 48, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, minHeight: 320 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <Logo size={52} />
                    <span style={{ fontSize: 32, fontWeight: 800, color: ts.cream, letterSpacing: "-1px" }}>
                        <span style={{ color: ts.ochre }}>two</span>-step
                    </span>
                </div>
                <span style={{ fontSize: 12, color: "rgba(245,237,214,0.4)", letterSpacing: "2.5px", textTransform: "uppercase" }}>
                    Toulouse · France · 2026
                </span>
            </div>

            <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: ts.ochre, marginBottom: 16 }}>
                    Qui on est
                </div>
                <h2 style={{ fontSize: "clamp(24px, 2.5vw, 38px)", fontWeight: 800, letterSpacing: "-0.5px", color: ts.brown, marginBottom: 20, lineHeight: 1.25 }}>
                    Deux frères,<br />un projet d'utilité locale.
                </h2>
                <p style={{ fontSize: 16, color: ts.brownMid, lineHeight: 1.8, marginBottom: 20 }}>
                    On a grandi à Toulouse. On a vu des boutiques qu'on adorait fermer, non pas parce que leurs produits étaient mauvais — mais parce que les gens ne savaient plus qu'elles existaient.
                </p>
                <p style={{ fontSize: 16, color: ts.brownMid, lineHeight: 1.8, marginBottom: 24 }}>
                    Two-Step, c'est notre réponse. Rendre le commerce local aussi facile à trouver qu'une commande Amazon. Sans changer ce qui fait son âme.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["100% digital", "Zéro hardware", "Lancé à Toulouse"].map((tag) => (
                        <span
                            key={tag}
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                background: "white", borderRadius: 100, padding: "8px 16px",
                                fontSize: 13, fontWeight: 600, color: ts.brown,
                            }}
                        >
                            <span style={{ color: ts.sage, fontWeight: 700 }}>✓</span> {tag}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    </section>
);

/* ── Contact ── */
const Contact = () => {
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

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

    const inputStyle: React.CSSProperties = {
        width: "100%",
        padding: "14px 16px",
        border: `1.5px solid rgba(44,32,24,0.12)`,
        borderRadius: 8,
        fontFamily: "inherit",
        fontSize: 15,
        color: ts.brown,
        background: ts.cream,
        outline: "none",
    };

    return (
        <section id="contact" style={{ padding: "120px 64px", maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: ts.ochre, marginBottom: 16 }}>
                Phase de lancement
            </div>
            <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 800, letterSpacing: "-0.5px", color: ts.brown, marginBottom: 12, lineHeight: 1.2 }}>
                On cherche des commerçants pionniers.
            </h2>
            <p style={{ fontSize: 16, color: ts.brownMid, maxWidth: 460, margin: "0 auto 56px", lineHeight: 1.7 }}>
                20 minutes, un café, votre avis. Pas d'engagement — juste une conversation.
            </p>

            <div style={{ background: "white", borderRadius: 24, padding: 48, textAlign: "left", boxShadow: "0 4px 32px rgba(44,32,24,0.07)" }}>
                {submitted ? (
                    <div style={{ textAlign: "center", padding: 40 }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                        <h3 style={{ fontSize: 22, fontWeight: 700, color: ts.brown, marginBottom: 8 }}>Message reçu !</h3>
                        <p style={{ fontSize: 15, color: ts.brownMid }}>On revient vers vous très vite pour fixer un café.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                            <div>
                                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ts.brown, marginBottom: 8 }}>Votre prénom</label>
                                <input name="name" type="text" placeholder="Marie" required style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ts.brown, marginBottom: 8 }}>Votre email</label>
                                <input name="email" type="email" placeholder="marie@laboutique.fr" required style={inputStyle} />
                            </div>
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ts.brown, marginBottom: 8 }}>Nom de votre boutique</label>
                            <input name="shop" type="text" placeholder="La Librairie du Coin" required style={inputStyle} />
                        </div>
                        <div style={{ marginBottom: 28 }}>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ts.brown, marginBottom: 8 }}>Ville</label>
                            <input name="city" type="text" placeholder="Toulouse" required style={inputStyle} />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: "100%",
                                background: loading ? ts.brownMid : ts.ochre,
                                color: "white",
                                border: "none",
                                padding: 18,
                                borderRadius: 100,
                                fontFamily: "inherit",
                                fontSize: 15,
                                fontWeight: 700,
                                cursor: loading ? "not-allowed" : "pointer",
                                transition: "background 0.2s",
                            }}
                        >
                            {loading ? "Envoi en cours…" : "Je veux être contacté →"}
                        </button>
                    </form>
                )}
            </div>
        </section>
    );
};

/* ── Footer ── */
const Footer = () => (
    <footer style={{ background: ts.brown, padding: "40px 64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: ts.cream, letterSpacing: "-0.3px" }}>
            <span style={{ color: ts.ochre }}>two</span>-step
        </span>
        <div style={{ fontSize: 12, color: "rgba(245,237,214,0.4)", textAlign: "right" }}>
            <a href="mailto:bauland@twostep.fr" style={{ color: "rgba(245,237,214,0.6)", textDecoration: "none" }}>bauland@twostep.fr</a>
            <br />Toulouse · 2026
        </div>
    </footer>
);

/* ── Main ── */
export const HomeScreen = () => {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handler = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", handler);
        return () => window.removeEventListener("scroll", handler);
    }, []);

    return (
        <main style={{ background: ts.cream, minHeight: "100vh" }}>
            <Navbar scrolled={scrolled} />
            <Hero />
            <Stats />
            <HowItWorks />
            <About />
            <Contact />
            <Footer />
        </main>
    );
};

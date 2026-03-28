"use client";

import { motion, useInView } from "motion/react";
import { useRef, useEffect, useState } from "react";
import { Zap, Package, Star01 } from "@untitledui/icons";
import { useIsMobile, E, Counter } from "../utils";
import { SpotlightCard } from "../components/spotlight-card";

function usePioneerCount() {
    const [count, setCount] = useState(0);
    useEffect(() => {
        fetch("/api/pioneers")
            .then((r) => r.json())
            .then((d) => setCount(d.count ?? 0))
            .catch(() => {});
    }, []);
    return count;
}

export function Pioneers() {
    const isMobile = useIsMobile();
    const pioneerCount = usePioneerCount();
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
                        margin: "0 auto 24px",
                        maxWidth: 560,
                    }}
                >
                    Pas pendant un mois. Pas pendant un trimestre.{" "}
                    <strong style={{ color: "#F5EDD6" }}>
                        Tant que Two-Step n'a pas prouvé sa valeur.
                    </strong>{" "}
                    Vous ne payez que quand 1 000 utilisateurs à Toulouse utilisent la plateforme. Zéro risque.
                </motion.p>

                {/* Live counter badge */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={inView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.6, delay: 0.15, ease: E }}
                    style={{
                        display: "inline-flex", alignItems: "center", gap: 10,
                        padding: "10px 20px", borderRadius: 14,
                        background: "rgba(200,129,58,0.1)", border: "1px solid rgba(200,129,58,0.2)",
                        marginBottom: 40,
                    }}
                >
                    <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                        <span style={{ fontSize: 28, fontWeight: 900, color: "#C8813A", letterSpacing: "-0.03em", lineHeight: 1 }}>
                            <Counter to={pioneerCount} inView={inView} />
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(245,237,214,0.5)" }}>/30</span>
                    </div>
                    <div style={{ width: 1, height: 24, background: "rgba(245,237,214,0.1)" }} />
                    <div style={{ textAlign: "left" as const }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#F5EDD6", lineHeight: 1.2 }}>places prises</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                            <motion.span
                                animate={{ opacity: [1, 0.3, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                style={{ width: 5, height: 5, borderRadius: "50%", background: "#7A9E7E", display: "block" }}
                            />
                            <span style={{ fontSize: 9, color: "#7A9E7E", fontWeight: 600 }}>en temps réel</span>
                        </div>
                    </div>
                </motion.div>

                {/* Feature cards */}
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
                        { Icon: Zap, title: "Compatible avec votre caisse", desc: "5 logiciels de caisse supportés. Connexion en un clic, synchronisation en continu." },
                        { Icon: Package, title: "Stock à jour en temps réel", desc: "Chaque vente en caisse met à jour votre vitrine instantanément. Vos clients voient ce qui est vraiment disponible." },
                        { Icon: Star01, title: "Un coach dans votre poche", desc: "Conseils personnalisés et retours clients filtrés par IA. Vous progressez chaque jour, sans effort." },
                    ].map((item, i) => (
                        <motion.div
                            key={item.title}
                            initial={{ opacity: 0, y: 24 }}
                            animate={inView ? { opacity: 1, y: 0 } : {}}
                            transition={{ duration: 0.6, delay: 0.4 + i * 0.1, ease: E }}
                        >
                            <SpotlightCard style={{
                                background: "rgba(245,237,214,0.06)",
                                padding: "28px 24px",
                                border: "1px solid rgba(245,237,214,0.08)",
                                height: "100%",
                            }}>
                                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={inView ? { opacity: 1, scale: 1 } : {}}
                                        transition={{ duration: 0.5, delay: 0.5 + i * 0.1, ease: E }}
                                        style={{
                                            width: 36, height: 36, borderRadius: 10,
                                            background: "rgba(200,129,58,0.12)",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            flexShrink: 0,
                                        }}
                                    >
                                        <item.Icon className="size-4" style={{ color: "#C8813A" }} />
                                    </motion.div>
                                    <div style={{ textAlign: "left" }}>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: "#F5EDD6", marginBottom: 6, lineHeight: 1.3 }}>
                                            {item.title}
                                        </div>
                                        <div style={{ fontSize: 13, color: "rgba(245,237,214,0.5)", lineHeight: 1.6 }}>
                                            {item.desc}
                                        </div>
                                    </div>
                                </div>
                            </SpotlightCard>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}

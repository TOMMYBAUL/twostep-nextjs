"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { useIsMobile, E } from "../utils";
import { SpotlightCard } from "../components/spotlight-card";

export function How() {
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
            desc: "Pas de livraison, pas de commission sur vos ventes. Le client cherche, il vous trouve, il pousse votre porte. Amazon perd une vente.",
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
                        >
                            <SpotlightCard style={{
                                background: step.bg,
                                padding: "40px 36px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 18,
                                height: "100%",
                            }}>
                                <motion.div whileHover={{ y: -6, transition: { duration: 0.25 } }}>
                                    <span style={{ fontSize: 52, fontWeight: 900, color: step.numColor, lineHeight: 1, letterSpacing: "-0.04em", display: "block" }}>
                                        {step.num}
                                    </span>
                                    <div style={{ marginTop: 18 }}>
                                        <h3 style={{ fontSize: 17, fontWeight: 700, color: step.titleColor, lineHeight: 1.3, letterSpacing: "-0.02em", margin: "0 0 10px" }}>
                                            {step.title}
                                        </h3>
                                        <p style={{ fontSize: 14, color: step.descColor, lineHeight: 1.65, margin: 0 }}>
                                            {step.desc}
                                        </p>
                                    </div>
                                </motion.div>
                            </SpotlightCard>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { useIsMobile, E } from "../utils";

export function About() {
    const isMobile = useIsMobile();
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });

    return (
        <section ref={ref} style={{ background: "#F8F9FC", padding: isMobile ? "80px 24px" : "120px 48px" }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: isMobile ? 40 : 80,
                    alignItems: "start",
                }}>
                    <motion.div
                        initial={{ opacity: 0, x: isMobile ? 0 : -40, y: isMobile ? 24 : 0 }}
                        animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
                        transition={{ duration: 0.8, ease: E }}
                    >
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#4268FF", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 20 }}>
                            À propos
                        </div>
                        <h2 style={{
                            fontSize: isMobile ? "clamp(32px, 8vw, 48px)" : "clamp(36px, 5.5vw, 68px)",
                            fontWeight: 800, color: "#1A1F36", lineHeight: 1.05,
                            letterSpacing: "-0.03em", margin: 0,
                        }}>
                            Nés à Toulouse,
                            <br />
                            <em style={{ fontStyle: "italic", color: "#4268FF" }}>fondateurs</em>
                            <br />
                            de Two-Step.
                        </h2>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: isMobile ? 0 : 40, y: isMobile ? 24 : 0 }}
                        animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
                        transition={{ duration: 0.8, delay: 0.15, ease: E }}
                    >
                        <p style={{ fontSize: isMobile ? 15 : 17, color: "#1A1F36", lineHeight: 1.72, margin: "0 0 20px" }}>
                            Deux frères qui ont vu leurs commerçants préférés perdre des ventes au profit des boutiques en ligne — non pas parce que les clients préféraient commander en ligne, mais parce qu'ils ne savaient pas que le produit exact existait en boutique, à deux pas de chez eux.
                        </p>
                        <p style={{ fontSize: isMobile ? 15 : 17, color: "#8E96B0", lineHeight: 1.72, margin: 0 }}>
                            Two-Step, c'est l'outil que les commerçants locaux n'avaient pas encore.
                        </p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

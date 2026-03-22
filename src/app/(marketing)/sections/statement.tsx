"use client";

import { motion, useInView } from "motion/react";
import { Fragment, useRef } from "react";
import { useIsMobile, Counter, E } from "../utils";

export function Statement() {
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

"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { SearchMd, MarkerPin01, ShoppingBag01, Wifi } from "@untitledui/icons";
import { useIsMobile, E, FloatCard } from "../utils";
import { BackgroundPaths } from "../components/background-paths";
import { LocationTag } from "../components/location-tag";

export function Hero() {
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
            {/* Animated background curves */}
            <BackgroundPaths />

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
                    {/* Location Tag */}
                    <LocationTag />

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
                            href="/discover"
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
                            Explorer les boutiques →
                        </motion.a>
                        <a href="/auth/login" style={{ fontSize: 14, color: "#6B4F38", fontWeight: 600, textDecoration: "none", opacity: 0.8 }}>
                            Espace commerçant
                        </a>
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
                                <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(200,129,58,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <SearchMd className="size-3.5" style={{ color: "#C8813A" }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: "#2C2018", lineHeight: 1.2 }}>Nike Air Max 90 · T.42</div>
                                    <div style={{ fontSize: 11, color: "#7A9E7E", fontWeight: 600, marginTop: 2 }}>✓ Disponible · 8 min</div>
                                </div>
                            </FloatCard>

                            <FloatCard top="20%" right="-14%" delay={0.95} floatDuration={3.7}>
                                <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(200,129,58,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <MarkerPin01 className="size-3.5" style={{ color: "#C8813A" }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color: "#C8813A", letterSpacing: "-0.04em", lineHeight: 1 }}>8 min</div>
                                    <div style={{ fontSize: 11, color: "#6B4F38", fontWeight: 500, marginTop: 2 }}>de chez vous</div>
                                </div>
                            </FloatCard>

                            <FloatCard bottom="12%" left="-10%" delay={1.15} floatDuration={5.1}>
                                <div style={{ width: 32, height: 32, borderRadius: 10, background: "#2C2018", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <ShoppingBag01 className="size-3.5" style={{ color: "#fff" }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: "#2C2018", lineHeight: 1.2 }}>Disponible</div>
                                    <div style={{ fontSize: 11, color: "#6B4F38", fontWeight: 500, marginTop: 2 }}>Boutique Carmes</div>
                                </div>
                            </FloatCard>

                            <FloatCard bottom="30%" right="-10%" delay={1.35} floatDuration={3.9}>
                                <Wifi className="size-3.5" style={{ color: "#7A9E7E" }} />
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

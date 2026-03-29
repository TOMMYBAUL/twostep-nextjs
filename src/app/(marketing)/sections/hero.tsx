"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { SearchMd, MarkerPin01, ShoppingBag01, Wifi } from "@untitledui/icons";
import { useIsMobile, E, FloatCard } from "../utils";
import { BackgroundPaths } from "../components/background-paths";
import { LocationTag } from "../components/location-tag";

const heroCSS = `
.hero-s{min-height:100vh;background:#FFFFFF;display:flex;align-items:center;padding:100px 48px 80px;position:relative;overflow:hidden}
.hero-g{max-width:1200px;margin:0 auto;width:100%;display:grid;grid-template-columns:3fr 2fr;gap:64px;align-items:center}
.hero-h1{font-size:clamp(42px,4.8vw,68px);font-weight:800;line-height:1.1;letter-spacing:-0.035em;color:#1A1F36;margin:0 0 24px}
.hero-p{font-size:18px;color:#8E96B0;line-height:1.65;max-width:480px;margin:0}
.hero-iw{position:relative;display:flex;justify-content:center;align-items:center;order:0;padding:0}
.hero-img{width:100%;max-width:440px;height:auto;display:block;filter:drop-shadow(0 32px 64px rgba(26,31,54,0.16))}
.fc-n{top:2%;left:-12%}.fc-m{top:20%;right:-14%}.fc-d{bottom:12%;left:-10%}.fc-t{bottom:30%;right:-10%}
@media(max-width:767px){
.hero-s{padding:76px 24px 48px}
.hero-g{grid-template-columns:1fr;gap:16px}
.hero-h1{font-size:clamp(34px,8vw,46px)}
.hero-p{font-size:16px}
.hero-iw{padding:32px 0 36px;overflow:hidden}
.hero-img{max-width:240px;margin:12px auto 8px}
.fc-n{top:8%!important;left:4px!important;transform:scale(0.6)!important;transform-origin:left top!important}
.fc-m{top:22%!important;right:4px!important;left:auto!important;transform:scale(0.6)!important;transform-origin:right top!important}
.fc-d{bottom:8%!important;left:4px!important;top:auto!important;transform:scale(0.6)!important;transform-origin:left bottom!important}
.fc-t{bottom:22%!important;right:4px!important;left:auto!important;top:auto!important;transform:scale(0.6)!important;transform-origin:right bottom!important}
}`;

export function Hero() {
    const isMobile = useIsMobile();
    const { scrollY } = useScroll();
    const imgY = useTransform(scrollY, [0, 700], [0, -50]);
    const textY = useTransform(scrollY, [0, 700], [0, -20]);

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: heroCSS }} />
            <section className="hero-s">
                <BackgroundPaths />

                {/* Glow */}
                <div style={{
                    position: "absolute",
                    top: "30%", right: "15%",
                    width: 500, height: 500,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(66,104,255,0.11) 0%, transparent 70%)",
                    pointerEvents: "none",
                }} />

                <div className="hero-g">
                    {/* Left — text */}
                    <motion.div style={{ y: textY }}>
                        <LocationTag />

                        <motion.h1
                            className="hero-h1"
                            initial={{ opacity: 0, y: 32 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.18, ease: E }}
                        >
                            Votre produit exact{" "}
                            <em style={{ fontStyle: "italic", color: "#4268FF" }}>est là.</em>
                            <br />
                            À deux pas de chez vous.
                        </motion.h1>

                        <motion.p
                            className="hero-p"
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, delay: 0.32, ease: E }}
                        >
                            Cet article qui vous fait envie depuis des jours ? Une boutique du quartier l'a en stock.
                            Two-Step vous dit laquelle. Et dans combien de minutes vous pouvez y être.
                        </motion.p>
                    </motion.div>

                    {/* Right — illustration + floating cards */}
                    <motion.div
                        className="hero-iw"
                        style={{ y: isMobile ? 0 : imgY }}
                    >
                        {/* Nike Air Max — top-left */}
                        <FloatCard className="fc-n" top="2%" left="-12%" delay={0.7} floatDuration={4.3}>
                            <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(66,104,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <SearchMd className="size-3.5" style={{ color: "#4268FF" }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#1A1F36", lineHeight: 1.2 }}>Nike Air Max 90 · T.42</div>
                                <div style={{ fontSize: 11, color: "#7A9E7E", fontWeight: 600, marginTop: 2 }}>✓ Disponible · 8 min</div>
                            </div>
                        </FloatCard>

                        {/* 8 min — right */}
                        <FloatCard className="fc-m" top="20%" right="-14%" delay={0.95} floatDuration={3.7}>
                            <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(66,104,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <MarkerPin01 className="size-3.5" style={{ color: "#4268FF" }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 900, color: "#4268FF", letterSpacing: "-0.04em", lineHeight: 1 }}>8 min</div>
                                <div style={{ fontSize: 11, color: "#8E96B0", fontWeight: 500, marginTop: 2 }}>de chez vous</div>
                            </div>
                        </FloatCard>

                        {/* Disponible — bottom-left */}
                        <FloatCard className="fc-d" bottom="12%" left="-10%" delay={1.15} floatDuration={5.1}>
                            <div style={{ width: 32, height: 32, borderRadius: 10, background: "#1A1F36", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <ShoppingBag01 className="size-3.5" style={{ color: "#fff" }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#1A1F36", lineHeight: 1.2 }}>Disponible</div>
                                <div style={{ fontSize: 11, color: "#8E96B0", fontWeight: 500, marginTop: 2 }}>Boutique Carmes</div>
                            </div>
                        </FloatCard>

                        {/* Temps réel */}
                        <FloatCard className="fc-t" bottom="30%" right="-10%" delay={1.35} floatDuration={3.9}>
                            <Wifi className="size-3.5" style={{ color: "#7A9E7E" }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1F36" }}>Temps réel · Toulouse</span>
                        </FloatCard>

                        <motion.img
                            className="hero-img"
                            src="/hero.png"
                            alt="Commerce local"
                            initial={{ opacity: 0, scale: 0.85, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{ duration: 1, delay: 0.2, ease: E }}
                        />
                    </motion.div>
                </div>
            </section>
        </>
    );
}

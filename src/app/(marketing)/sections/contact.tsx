"use client";

import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";
import { useIsMobile, E } from "../utils";
import { GlowInput } from "../components/glow-input";

export function Contact() {
    const isMobile = useIsMobile();
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-8%" });
    const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
    const [shakeKey, setShakeKey] = useState(0);

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
                setShakeKey(k => k + 1);
            }
        } catch {
            setStatus("error");
            setShakeKey(k => k + 1);
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
                        style={{ padding: 48, borderRadius: 24, background: "#2C2018", textAlign: "center", position: "relative", overflow: "hidden" }}
                    >
                        {/* Confetti */}
                        {Array.from({ length: 8 }).map((_, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 1, y: 0, x: 0 }}
                                animate={{ opacity: 0, y: 60, x: (Math.random() - 0.5) * 60 }}
                                transition={{ duration: 1, delay: 0.2 + i * 0.05, ease: "easeOut" }}
                                style={{
                                    position: "absolute",
                                    top: "30%",
                                    left: `${40 + Math.random() * 20}%`,
                                    width: 4, height: 4,
                                    borderRadius: "50%",
                                    background: i % 2 === 0 ? "#C8813A" : "#7A9E7E",
                                }}
                            />
                        ))}

                        {/* Animated checkmark */}
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
                            style={{
                                width: 52, height: 52, borderRadius: "50%",
                                background: "#C8813A",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                margin: "0 auto 20px",
                            }}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <motion.polyline
                                    points="20 6 9 17 4 12"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
                                />
                            </svg>
                        </motion.div>

                        <p style={{ color: "#F5EDD6", fontWeight: 700, fontSize: 17, margin: "0 0 4px" }}>
                            C'est envoyé !
                        </p>
                        <p style={{ color: "rgba(245,237,214,0.5)", fontSize: 13, margin: 0 }}>
                            On vous contacte sous 48h.
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
                            >
                                <GlowInput
                                    name={field.name}
                                    label={field.label}
                                    type={field.type}
                                    placeholder={field.placeholder}
                                    required
                                />
                            </motion.div>
                        ))}

                        <motion.button
                            key={shakeKey}
                            type="submit"
                            disabled={status === "sending"}
                            whileHover={{ scale: 1.04, boxShadow: "0 12px 36px rgba(44,32,24,0.3)" }}
                            whileTap={{ scale: 0.97 }}
                            animate={status === "error" ? { x: [0, -8, 8, -6, 6, 0] } : {}}
                            transition={{ duration: 0.3 }}
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
                            <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{ color: "#C8813A", fontSize: 14, margin: 0 }}
                            >
                                Une erreur s'est produite. Écrivez-nous à{" "}
                                <a href="mailto:contact@twostep.fr" style={{ color: "#C8813A" }}>contact@twostep.fr</a>
                            </motion.p>
                        )}
                    </motion.form>
                )}
            </div>
        </section>
    );
}

"use client";

import { motion } from "motion/react";

export function Marquee() {
    const base = "SNEAKERS DISTRICT  ·  LA FRIPERIE TOULOUSAINE  ·  CAVE VICTOR HUGO  ·  LIBRAIRIE OMBRES  ·  SPORT CONCEPT  ·  BIJOUX SANDRA  ·  ";
    return (
        <div style={{ overflow: "hidden", background: "#1A1F36", padding: "13px 0" }}>
            <motion.div
                animate={{ x: ["0%", "-50%"] }}
                transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
                style={{ display: "inline-flex", whiteSpace: "nowrap", willChange: "transform" }}
            >
                {[0, 1, 2, 3].map((i) => (
                    <span key={i} style={{ color: "rgba(255,255,255,0.25)", fontWeight: 700, fontSize: 11, letterSpacing: "0.14em" }}>
                        {base}
                    </span>
                ))}
            </motion.div>
        </div>
    );
}

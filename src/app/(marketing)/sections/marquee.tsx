"use client";

import { motion } from "motion/react";

export function Marquee() {
    const base = "COMMERCE LOCAL  ·  STOCK VISIBLE  ·  TEMPS RÉEL  ·  TOULOUSE  ·  ZÉRO SAISIE  ·  VOS CLIENTS VIENNENT À VOUS  ·  ";
    return (
        <div style={{ overflow: "hidden", background: "#C8813A", padding: "13px 0" }}>
            <motion.div
                animate={{ x: ["0%", "-50%"] }}
                transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
                style={{ display: "inline-flex", whiteSpace: "nowrap" }}
            >
                {[0, 1, 2, 3].map((i) => (
                    <span key={i} style={{ color: "#F5EDD6", fontWeight: 700, fontSize: 11, letterSpacing: "0.14em" }}>
                        {base}
                    </span>
                ))}
            </motion.div>
        </div>
    );
}

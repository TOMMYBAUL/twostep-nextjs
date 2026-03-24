"use client";

import { motion } from "motion/react";
import { useIsMobile } from "../utils";

export function Nav() {
    const isMobile = useIsMobile();
    return (
        <motion.nav
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{
                position: "fixed",
                top: 0, left: 0, right: 0,
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: isMobile ? "0 20px" : "0 48px",
                height: 64,
                background: "rgba(245, 237, 214, 0.9)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderBottom: "1px solid rgba(200, 129, 58, 0.1)",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src="/logo-icon.webp" alt="" style={{ height: 32, width: 32, borderRadius: 8 }} />
                <span style={{ fontSize: 17, fontWeight: 800, color: "#2C2018", letterSpacing: "-0.03em" }}>
                    Two-Step
                </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {!isMobile && (
                    <a href="/discover" style={{
                        padding: "8px 18px",
                        borderRadius: 999,
                        border: "1.5px solid rgba(44,32,24,0.15)",
                        color: "#2C2018",
                        fontWeight: 600,
                        fontSize: 13,
                        textDecoration: "none",
                    }}>
                        Explorer les boutiques
                    </a>
                )}
                <motion.a
                    href="/auth/login"
                    whileHover={{ scale: 1.05, boxShadow: "0 6px 24px rgba(200,129,58,0.35)" }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                        padding: isMobile ? "9px 18px" : "10px 22px",
                        borderRadius: 999,
                        background: "#C8813A",
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 13,
                        textDecoration: "none",
                    }}
                >
                    Espace commerçant
                </motion.a>
            </div>
        </motion.nav>
    );
}

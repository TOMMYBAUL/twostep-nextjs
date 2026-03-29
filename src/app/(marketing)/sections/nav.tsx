"use client";

import Image from "next/image";
import { motion } from "motion/react";

const navCSS = `
.nav-bar{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 48px;height:64px;background:rgba(245,237,214,0.9);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(200,129,58,0.1)}
.nav-btn-outline{padding:8px 18px;border-radius:999px;border:1.5px solid rgba(44,32,24,0.15);color:#2C2018;font-weight:600;font-size:13px;text-decoration:none}
.nav-btn-fill{padding:10px 22px;border-radius:999px;background:#C8813A;color:#fff;font-weight:700;font-size:13px;text-decoration:none;display:inline-block}
.nav-short{display:none}
@media(max-width:767px){
.nav-bar{padding:0 14px}
.nav-btn-outline{padding:5px 10px;font-size:10px}
.nav-btn-fill{padding:5px 10px;font-size:10px}
.nav-full{display:none}
.nav-short{display:inline}
}`;

export function Nav() {
    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: navCSS }} />
            <motion.nav
                className="nav-bar"
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
            >
                <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                    <Image src="/logo-icon.webp" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
                    <span style={{ fontSize: 17, fontWeight: 800, color: "#2C2018", letterSpacing: "-0.03em" }}>
                        Two-Step
                    </span>
                </a>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <a href="/discover" className="nav-btn-outline">
                        <span className="nav-full">Explorer les boutiques</span>
                        <span className="nav-short">Explorer</span>
                    </a>
                    <motion.a
                        href="/auth/login"
                        className="nav-btn-fill"
                        whileHover={{ scale: 1.05, boxShadow: "0 6px 24px rgba(200,129,58,0.35)" }}
                        whileTap={{ scale: 0.96 }}
                    >
                        Espace commerçant
                    </motion.a>
                </div>
            </motion.nav>
        </>
    );
}

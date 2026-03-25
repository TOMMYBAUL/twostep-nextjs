"use client";

import Image from "next/image";
import { useIsMobile } from "../utils";

export function Footer() {
    const isMobile = useIsMobile();
    return (
        <footer style={{
            background: "#2C2018",
            padding: isMobile ? "32px 24px" : "40px 48px",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: isMobile ? 8 : 0,
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Image src="/logo-icon.webp" alt="" width={28} height={28} style={{ borderRadius: 6 }} />
                <span style={{ fontSize: 17, fontWeight: 800, color: "#F5EDD6", letterSpacing: "-0.03em" }}>
                    Two-Step
                </span>
            </div>
            <span style={{ fontSize: 13, color: "rgba(245,237,214,0.38)" }}>
                © 2026 · Toulouse, France
            </span>
        </footer>
    );
}

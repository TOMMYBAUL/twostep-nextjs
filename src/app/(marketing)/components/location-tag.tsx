"use client";

import { motion } from "motion/react";
import { MarkerPin01 } from "@untitledui/icons";
import { E } from "../utils";

export function LocationTag() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: E }}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 28,
                padding: "6px 16px",
                borderRadius: 999,
                background: "rgba(122, 158, 126, 0.12)",
                border: "1px solid rgba(122, 158, 126, 0.3)",
            }}
        >
            <MarkerPin01 className="size-3.5" style={{ color: "#7A9E7E" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#7A9E7E", letterSpacing: "0.04em" }}>
                TOULOUSE · EN DIRECT
            </span>
            <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ width: 6, height: 6, borderRadius: "50%", background: "#7A9E7E", display: "block", flexShrink: 0 }}
            />
        </motion.div>
    );
}

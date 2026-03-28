"use client";

import { animate, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const E = [0.22, 1, 0.36, 1] as any;

/* ── Hooks ──────────────────────────────────────────────────────────── */

export function useIsMobile() {
    const [mobile, setMobile] = useState(false);
    useEffect(() => {
        const check = () => setMobile(window.innerWidth < 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);
    return mobile;
}

export function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReduced(mq.matches);
        const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);
    return reduced;
}

/* ── Counter ────────────────────────────────────────────────────────── */

export function Counter({ to, inView }: { to: number; inView: boolean }) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!inView) return;
        const ctrl = animate(0, to, {
            duration: 2,
            ease: "easeOut",
            onUpdate: (v) => setVal(Math.round(v)),
        });
        return () => ctrl.stop();
    }, [inView, to]);
    return <>{val}</>;
}

/* ── Floating card ──────────────────────────────────────────────────── */

interface FloatCardProps {
    className?: string;
    top?: string | number;
    bottom?: string | number;
    left?: string | number;
    right?: string | number;
    delay?: number;
    floatDuration?: number;
    children: React.ReactNode;
}

export function FloatCard({ className, top, bottom, left, right, delay = 0, floatDuration = 4, children }: FloatCardProps) {
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, scale: 0.72, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: [0, -13, 0] }}
            transition={{
                opacity: { duration: 0.45, delay },
                scale: { duration: 0.6, delay, ease: E },
                y: { duration: floatDuration, repeat: Infinity, ease: "easeInOut", delay: delay + 0.6 },
            }}
            style={{
                position: "absolute",
                top, bottom, left, right,
                background: "#fff",
                borderRadius: 12,
                padding: "6px 10px",
                boxShadow: "0 4px 16px rgba(44,32,24,0.08)",
                border: "1px solid rgba(200,129,58,0.08)",
                display: "flex",
                alignItems: "center",
                gap: 7,
                zIndex: 10,
                userSelect: "none",
                whiteSpace: "nowrap",
                transform: "scale(0.65)",
                transformOrigin: "center center",
            }}
        >
            {children}
        </motion.div>
    );
}

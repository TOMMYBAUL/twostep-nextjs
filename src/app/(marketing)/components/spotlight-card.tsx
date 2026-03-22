"use client";

import { motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { useIsMobile } from "../utils";

interface SpotlightCardProps {
    children: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
}

export function SpotlightCard({ children, style, className }: SpotlightCardProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [hovering, setHovering] = useState(false);
    const isMobile = useIsMobile();

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current || isMobile) return;
        const rect = ref.current.getBoundingClientRect();
        setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }, [isMobile]);

    return (
        <motion.div
            ref={ref}
            className={className}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => !isMobile && setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 24,
                border: hovering ? "1px solid rgba(200,129,58,0.15)" : "1px solid transparent",
                boxShadow: hovering ? "0 0 30px rgba(200,129,58,0.1)" : "none",
                transition: "border-color 200ms, box-shadow 300ms",
                ...style,
            }}
        >
            {/* Glow overlay */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background: hovering
                        ? `radial-gradient(circle 200px at ${pos.x}px ${pos.y}px, rgba(200,129,58,0.12), transparent)`
                        : "transparent",
                    transition: "opacity 300ms",
                    opacity: hovering ? 1 : 0,
                    zIndex: 1,
                }}
            />
            {/* Content */}
            <div style={{ position: "relative", zIndex: 2 }}>
                {children}
            </div>
        </motion.div>
    );
}

"use client";

import { useEffect } from "react";

/**
 * Snap-back zoom: allows the pinch gesture but forces
 * the viewport back to scale 1 when fingers are lifted.
 */
export function ZoomReset() {
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        let timer: ReturnType<typeof setTimeout>;

        const onResize = () => {
            clearTimeout(timer);
            // 300ms after last resize event ≈ fingers lifted
            timer = setTimeout(() => {
                if (vv.scale > 1.02) {
                    const meta = document.querySelector('meta[name="viewport"]');
                    if (!meta) return;
                    const base = meta.getAttribute("content") || "";
                    // Temporarily lock to 1 → browser snaps back
                    meta.setAttribute("content", base + ", maximum-scale=1");
                    requestAnimationFrame(() => {
                        // Restore original to allow future gestures
                        setTimeout(() => meta.setAttribute("content", base), 120);
                    });
                }
            }, 300);
        };

        vv.addEventListener("resize", onResize);
        return () => {
            vv.removeEventListener("resize", onResize);
            clearTimeout(timer);
        };
    }, []);

    return null;
}

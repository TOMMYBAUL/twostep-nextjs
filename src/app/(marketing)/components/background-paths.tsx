"use client";

import { useIsMobile, useReducedMotion } from "../utils";

export function BackgroundPaths() {
    const isMobile = useIsMobile();
    const reduced = useReducedMotion();
    const pathCount = isMobile ? 2 : 3;

    const paths = [
        { d: "M-50,180 Q100,80 200,180 T450,160", stroke: "#7A9E7E", width: 1.5, dur: "8s", values: "0,0;20,-10;0,0" },
        { d: "M-50,220 Q150,120 250,220 T500,200", stroke: "#4268FF", width: 1, dur: "10s", values: "0,0;-15,8;0,0" },
        { d: "M-30,260 Q120,180 280,260 T480,240", stroke: "#7A9E7E", width: 0.8, dur: "12s", values: "0,0;10,-5;0,0" },
    ].slice(0, pathCount);

    return (
        <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07, pointerEvents: "none" }}
            viewBox="0 0 400 340"
            preserveAspectRatio="none"
            aria-hidden="true"
        >
            {paths.map((p, i) => (
                <path key={i} d={p.d} fill="none" stroke={p.stroke} strokeWidth={p.width}>
                    {!reduced && (
                        <animateTransform
                            attributeName="transform"
                            type="translate"
                            values={p.values}
                            dur={p.dur}
                            repeatCount="indefinite"
                        />
                    )}
                </path>
            ))}
        </svg>
    );
}

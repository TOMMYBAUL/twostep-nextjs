"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import { useReducedMotion } from "../utils";

const Lottie = lazy(() => import("lottie-react"));

interface LottieIconProps {
    path: string;
    size?: number;
    loop?: boolean;
    autoplay?: boolean;
    fallback?: React.ReactNode;
}

export function LottieIcon({ path, size = 40, loop = false, autoplay = true, fallback }: LottieIconProps) {
    const [animationData, setAnimationData] = useState(null);
    const [error, setError] = useState(false);
    const reduced = useReducedMotion();

    useEffect(() => {
        fetch(path)
            .then(r => r.json())
            .then(setAnimationData)
            .catch(() => setError(true));
    }, [path]);

    if (error || reduced) return <>{fallback}</>;
    if (!animationData) return <div style={{ width: size, height: size }} />;

    return (
        <Suspense fallback={<div style={{ width: size, height: size }} />}>
            <Lottie
                animationData={animationData}
                loop={loop}
                autoplay={autoplay}
                style={{ width: size, height: size }}
            />
        </Suspense>
    );
}

"use client";

import { useEffect, useRef, useState } from "react";

type HeroStatProps = {
    value: number;
    label: string;
    trend?: number;
};

function useCountUp(target: number, duration = 800) {
    const [current, setCurrent] = useState(0);
    const prevTarget = useRef(0);

    useEffect(() => {
        if (target === prevTarget.current) return;
        const start = prevTarget.current;
        prevTarget.current = target;
        const startTime = performance.now();

        function animate(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCurrent(Math.round(start + (target - start) * eased));
            if (progress < 1) requestAnimationFrame(animate);
        }

        requestAnimationFrame(animate);
    }, [target, duration]);

    return current;
}

export function HeroStat({ value, label, trend }: HeroStatProps) {
    const animatedValue = useCountUp(value);
    const trendPositive = trend !== undefined && trend >= 0;

    return (
        <div className="text-center">
            <p className="text-5xl font-bold tracking-tight" style={{ color: "var(--ts-dark)" }}>
                {animatedValue}
            </p>
            <p className="mt-1 text-sm text-secondary">{label}</p>
            {trend !== undefined && trend !== 0 && (
                <p className={`mt-1 text-xs font-medium ${trendPositive ? "text-[#5a9474]" : "text-[#c4553a]"}`}>
                    {trendPositive ? "+" : ""}{trend}% vs semaine dernière
                </p>
            )}
        </div>
    );
}

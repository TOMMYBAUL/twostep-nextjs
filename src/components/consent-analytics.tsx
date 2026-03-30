"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { useConsent } from "@/hooks/use-consent";

export function ConsentAnalytics() {
    const { consent } = useConsent();

    if (consent !== "accepted") return null;

    return (
        <>
            <Analytics />
            <SpeedInsights />
        </>
    );
}

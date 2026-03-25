"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const STORAGE_KEY = "onboarding_completed";

/**
 * Checks localStorage for onboarding completion.
 * Redirects to /onboarding if first-time user.
 */
export function OnboardingRedirect() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Don't redirect if already on onboarding-related pages
        if (pathname?.startsWith("/onboarding")) return;

        if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
            router.replace("/onboarding");
        }
    }, [router, pathname]);

    return null;
}

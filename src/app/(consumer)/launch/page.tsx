"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * PWA launch trampoline — redirects immediately to /explore.
 * This client-side navigation forces iOS to recalculate the viewport,
 * fixing the tab bar elevation bug on first paint in standalone mode.
 */
export default function LaunchPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/explore");
    }, [router]);

    // Match explore page background so there's no flash
    return <div className="fixed inset-0 bg-[#e8eaed]" />;
}

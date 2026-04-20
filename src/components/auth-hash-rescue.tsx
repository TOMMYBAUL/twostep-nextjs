"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Rescue for Supabase email-confirmation links that land on the Site URL
// with a #access_token fragment (default template behavior). The fragment
// never reaches the server, so /auth/confirm never runs and new merchant
// signups lose their user_metadata payload. This component catches the
// fragment on any page, establishes the cookie session via setSession,
// then hands off to /auth/finalize which runs createMerchantFromMetadata
// and redirects to the right destination.
export function AuthHashRescue() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        const hash = window.location.hash;
        if (!hash || !hash.includes("access_token=")) return;

        const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        const type = params.get("type");
        if (!access_token || !refresh_token) return;

        // Let the reset-password page handle recovery tokens natively via
        // Supabase SDK's onAuthStateChange(PASSWORD_RECOVERY). Our rescue
        // is only for signup/magiclink flows where no dedicated page exists.
        if (type === "recovery") return;
        if (window.location.pathname.startsWith("/auth/reset-password")) return;

        (async () => {
            const supabase = createClient();
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) {
                window.location.replace(`/auth/error?reason=${encodeURIComponent(error.message)}`);
                return;
            }
            history.replaceState(null, "", window.location.pathname + window.location.search);
            window.location.replace(`/auth/finalize?type=${encodeURIComponent(type ?? "signup")}`);
        })();
    }, []);

    return null;
}

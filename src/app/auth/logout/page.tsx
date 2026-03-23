"use client";

import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LogoutPage() {
    useEffect(() => {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );

        supabase.auth.signOut().then(() => {
            window.location.href = "/auth/login";
        });
    }, []);

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
            <p style={{ color: "#6b7280" }}>Déconnexion en cours...</p>
        </div>
    );
}

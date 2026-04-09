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
        <div className="flex min-h-dvh items-center justify-center">
            <p className="text-tertiary">Déconnexion en cours...</p>
        </div>
    );
}

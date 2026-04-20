"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 1500;
const MAX_ATTEMPTS = 20;

export default function BillingSuccessPage() {
    const router = useRouter();
    const [message, setMessage] = useState("Activation de ton abonnement…");
    const [error, setError] = useState("");

    useEffect(() => {
        const supabase = createClient();
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
            attempts += 1;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setError("Session expirée, reconnecte-toi.");
                return;
            }

            const { data: merchant } = await supabase
                .from("merchants")
                .select("billing_status")
                .eq("user_id", user.id)
                .maybeSingle();

            if (merchant?.billing_status === "trialing" || merchant?.billing_status === "active") {
                setMessage("C'est bon, redirection…");
                router.replace("/dashboard");
                return;
            }

            if (attempts >= MAX_ATTEMPTS) {
                setError(
                    "L'activation prend plus de temps que prévu. Essaie de rafraîchir ton dashboard dans 1 minute.",
                );
                return;
            }

            timer = setTimeout(poll, POLL_INTERVAL_MS);
        };

        poll();
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [router]);

    return (
        <div className="flex min-h-dvh items-center justify-center bg-secondary px-4">
            <div className="w-full max-w-sm text-center">
                <img src="/logo-icon.webp?v=2" alt="Two-Step" className="mx-auto mb-4 size-12 rounded-xl" />
                {error ? (
                    <>
                        <p className="mb-4 text-sm text-red-600">{error}</p>
                        <a href="/dashboard" className="text-sm font-medium text-brand-secondary">Aller au dashboard</a>
                    </>
                ) : (
                    <>
                        <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-[#4268FF]/30 border-t-[#4268FF]" />
                        <p className="text-sm text-primary">{message}</p>
                    </>
                )}
            </div>
        </div>
    );
}

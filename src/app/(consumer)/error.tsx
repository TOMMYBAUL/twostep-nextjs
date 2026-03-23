"use client";

import { useEffect } from "react";

export default function ConsumerError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Consumer app error:", error);
    }, [error]);

    return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--ts-cream-dark)]">
                <span className="text-2xl font-bold text-[var(--ts-brown-mid)]/30">!</span>
            </div>
            <h2 className="font-display text-lg font-bold text-[var(--ts-brown)]">
                Oups, quelque chose a planté
            </h2>
            <p className="max-w-xs text-sm text-[var(--ts-brown-mid)]/60">
                Pas de panique — tes données sont en sécurité. Réessaie ou reviens plus tard.
            </p>
            <button
                type="button"
                onClick={reset}
                className="mt-2 rounded-2xl bg-[var(--ts-ochre)] px-6 py-3 text-sm font-bold text-white shadow-sm transition duration-150 active:opacity-90"
            >
                Réessayer
            </button>
        </div>
    );
}

"use client";

import { useEffect } from "react";
import { RefreshCcw01 } from "@untitledui/icons";
import { captureError } from "@/lib/error";

export default function ConsumerError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        captureError(error, { boundary: "consumer" });
    }, [error]);

    return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-secondary">
                <span className="text-2xl font-bold text-quaternary">!</span>
            </div>
            <h2 className="font-heading text-lg font-bold uppercase text-primary">
                Oups, quelque chose a planté
            </h2>
            <p className="max-w-xs text-sm text-tertiary">
                Pas de panique — tes données sont en sécurité. Réessaie ou reviens plus tard.
            </p>
            <button
                type="button"
                onClick={reset}
                className="mt-2 inline-flex items-center gap-2 rounded-2xl bg-brand-solid px-6 py-3 text-sm font-bold text-white shadow-sm transition duration-150 active:opacity-90"
            >
                <RefreshCcw01 className="size-4" />
                Réessayer
            </button>
        </div>
    );
}

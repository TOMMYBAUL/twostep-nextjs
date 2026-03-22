"use client";

export default function ConsumerError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-lg font-semibold text-primary">Quelque chose a mal tourné</p>
            <p className="text-sm text-tertiary">{error.message || "Erreur inattendue"}</p>
            <button
                type="button"
                onClick={reset}
                className="rounded-xl bg-[var(--ts-ochre)] px-6 py-2.5 text-sm font-semibold text-white transition duration-100 hover:opacity-90"
            >
                Réessayer
            </button>
        </div>
    );
}

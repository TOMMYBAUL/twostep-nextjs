"use client";

export default function MarketingError({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
            <h1 className="text-2xl font-bold text-[#1A1F36]">
                Oups, quelque chose s'est mal passé
            </h1>
            <p className="mt-3 text-sm text-[#6B7280]">
                Une erreur inattendue est survenue. Réessaie dans quelques instants.
            </p>
            <button
                type="button"
                onClick={reset}
                className="mt-6 rounded-xl bg-[#4268FF] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#3558e8]"
            >
                Réessayer
            </button>
        </div>
    );
}

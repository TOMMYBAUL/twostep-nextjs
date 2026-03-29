import Link from "next/link";

export default function ConsumerNotFound() {
    return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
            <span className="text-5xl">🔍</span>
            <h1 className="mt-4 font-display text-xl font-bold uppercase text-[var(--ts-brown)]">
                Page introuvable
            </h1>
            <p className="mt-2 max-w-xs text-sm text-[var(--ts-brown-mid)]/60">
                Cette page n&apos;existe pas ou a été déplacée.
            </p>
            <Link
                href="/discover"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--ts-ochre)] px-5 py-2.5 text-sm font-semibold text-white transition duration-150 active:opacity-90"
            >
                Retour à l&apos;accueil
            </Link>
        </div>
    );
}

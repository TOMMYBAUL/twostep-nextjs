import Link from "next/link";

export default async function AuthErrorPage({
    searchParams,
}: {
    searchParams: Promise<{ reason?: string }>;
}) {
    const { reason } = await searchParams;

    return (
        <div className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-8">
            <div className="w-full max-w-sm text-center">
                <img src="/logo-icon.webp?v=2" alt="Two-Step" className="mx-auto mb-4 size-12 rounded-xl" />
                <h1 className="mb-2 font-display text-xl font-bold uppercase text-primary">Confirmation impossible</h1>
                <p className="mb-6 text-sm text-tertiary">
                    Le lien de confirmation est invalide ou a expiré.
                </p>
                {reason && (
                    <p className="mb-6 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">
                        {reason}
                    </p>
                )}
                <div className="space-y-3">
                    <Link
                        href="/auth/login"
                        className="block w-full rounded-xl bg-[#4268FF] px-5 py-3 text-sm font-semibold text-white"
                    >
                        Se connecter
                    </Link>
                    <Link
                        href="/auth/signup"
                        className="block w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary shadow-sm"
                    >
                        Réessayer l'inscription
                    </Link>
                </div>
            </div>
        </div>
    );
}

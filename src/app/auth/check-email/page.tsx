import Link from "next/link";

export default async function CheckEmailPage({
    searchParams,
}: {
    searchParams: Promise<{ email?: string }>;
}) {
    const { email } = await searchParams;

    return (
        <div className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-8">
            <div className="w-full max-w-sm text-center">
                <img src="/logo-icon.webp?v=2" alt="Two-Step" className="mx-auto mb-4 size-12 rounded-xl" />
                <div className="mb-4 text-4xl">📬</div>
                <h1 className="mb-2 font-display text-xl font-bold uppercase text-primary">
                    Vérifie tes emails
                </h1>
                <p className="mb-2 text-sm text-tertiary">
                    On vient d'envoyer un lien de confirmation à
                </p>
                {email && (
                    <p className="mb-6 text-sm font-semibold text-primary">{email}</p>
                )}
                <p className="mb-6 text-xs text-tertiary">
                    Clique sur le lien pour activer ton compte. Pense à vérifier tes spams.
                </p>
                <div className="space-y-3">
                    <Link
                        href="/auth/login"
                        className="block w-full rounded-xl bg-[#4268FF] px-5 py-3 text-sm font-semibold text-white"
                    >
                        Retour à la connexion
                    </Link>
                </div>
            </div>
        </div>
    );
}

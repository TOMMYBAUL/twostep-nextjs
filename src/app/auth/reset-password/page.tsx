"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSession, setHasSession] = useState(false);

    useEffect(() => {
        // Supabase redirects with a hash fragment containing the access token.
        // The client library auto-picks it up when we create the client.
        const supabase = createClient();
        supabase.auth.getSession().then(({ data }) => {
            if (data.session) setHasSession(true);
        });
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");

        if (password.length < 8) {
            setError("Le mot de passe doit contenir au moins 8 caractères");
            return;
        }
        if (password !== confirm) {
            setError("Les mots de passe ne correspondent pas");
            return;
        }

        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error: authError } = await supabase.auth.updateUser({ password });
            if (authError) throw authError;
            setSuccess(true);
            setTimeout(() => router.push("/dashboard"), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Une erreur est survenue");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--ts-bg-warm)" }}>
            <div className="w-full max-w-sm">
                <div className="mb-8 text-center">
                    <img src="/logo-icon.webp?v=2" alt="Two-Step" className="mx-auto mb-3 size-12 rounded-xl" />
                    <h1 className="font-display text-xl font-semibold uppercase" style={{ color: "var(--ts-dark)" }}>
                        Nouveau mot de passe
                    </h1>
                    <p className="mt-1 text-sm text-gray-400">
                        Choisissez un nouveau mot de passe sécurisé
                    </p>
                </div>

                {success ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                        <p className="text-sm font-medium text-green-800">Mot de passe mis à jour !</p>
                        <p className="mt-1 text-xs text-green-600">
                            Redirection vers le dashboard...
                        </p>
                    </div>
                ) : !hasSession ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                        <p className="text-sm font-medium text-amber-800">Lien expiré ou invalide</p>
                        <p className="mt-1 text-xs text-amber-600">
                            Demandez un nouveau lien de réinitialisation.
                        </p>
                        <Link
                            href="/auth/forgot-password"
                            className="mt-4 inline-block text-sm font-medium"
                            style={{ color: "var(--ts-terracotta)" }}
                        >
                            Renvoyer un lien
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                                Nouveau mot de passe
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="search-ts w-full"
                                placeholder="••••••••"
                                required
                                minLength={8}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                                Confirmer le mot de passe
                            </label>
                            <input
                                type="password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                className="search-ts w-full"
                                placeholder="••••••••"
                                required
                                minLength={8}
                            />
                        </div>

                        {error && <p className="text-xs text-red-500">{error}</p>}

                        <button type="submit" className="btn-ts w-full" disabled={isLoading}>
                            {isLoading ? "Mise à jour..." : "Changer le mot de passe"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

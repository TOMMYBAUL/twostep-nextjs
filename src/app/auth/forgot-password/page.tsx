"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/reset-password`,
            });
            if (authError) throw authError;
            setSent(true);
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
                        Mot de passe oublié
                    </h1>
                    <p className="mt-1 text-sm text-gray-400">
                        Entrez votre email pour recevoir un lien de réinitialisation
                    </p>
                </div>

                {sent ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                        <p className="text-sm font-medium text-green-800">Email envoyé !</p>
                        <p className="mt-1 text-xs text-green-600">
                            Vérifiez votre boîte mail (et vos spams) pour réinitialiser votre mot de passe.
                        </p>
                        <Link
                            href="/auth/login"
                            className="mt-4 inline-block text-sm font-medium"
                            style={{ color: "var(--ts-terracotta)" }}
                        >
                            Retour à la connexion
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="search-ts w-full"
                                placeholder="vous@boutique.fr"
                                required
                            />
                        </div>

                        {error && <p className="text-xs text-red-500">{error}</p>}

                        <button type="submit" className="btn-ts w-full" disabled={isLoading}>
                            {isLoading ? "Envoi..." : "Envoyer le lien"}
                        </button>

                        <p className="text-center text-sm text-gray-400">
                            <Link href="/auth/login" className="font-medium" style={{ color: "var(--ts-terracotta)" }}>
                                Retour à la connexion
                            </Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}

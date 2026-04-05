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
        <div className="flex min-h-dvh items-center justify-center bg-[#F8F9FC] px-4">
            <div className="w-full max-w-sm">
                <div className="mb-8 text-center">
                    <img src="/logo-icon.webp?v=2" alt="Two-Step" className="mx-auto mb-3 size-12 rounded-xl" />
                    <h1 className="font-display text-xl font-semibold uppercase text-[#1A1F36]">
                        Mot de passe oubli&eacute;
                    </h1>
                    <p className="mt-1 text-sm text-[#8E96B0]">
                        Entrez votre email pour recevoir un lien de r&eacute;initialisation
                    </p>
                </div>

                {sent ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                        <p className="text-sm font-medium text-green-800">Email envoy&eacute; !</p>
                        <p className="mt-1 text-xs text-green-600">
                            V&eacute;rifiez votre bo&icirc;te mail (et vos spams) pour r&eacute;initialiser votre mot de passe.
                        </p>
                        <Link
                            href="/auth/login"
                            className="mt-4 inline-block text-sm font-medium text-[#4268FF]"
                        >
                            Retour &agrave; la connexion
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                placeholder="vous@boutique.fr"
                                required
                            />
                        </div>

                        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">{error}</p>}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full rounded-xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90 disabled:opacity-50"
                        >
                            {isLoading ? "Envoi..." : "Envoyer le lien"}
                        </button>

                        <p className="text-center text-sm text-[#8E96B0]">
                            <Link href="/auth/login" className="font-medium text-[#4268FF]">
                                Retour &agrave; la connexion
                            </Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}

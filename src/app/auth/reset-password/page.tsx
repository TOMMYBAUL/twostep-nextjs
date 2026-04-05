"use client";

import Link from "next/link";
import { useState, useEffect, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
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

            // Check if user is a merchant to redirect appropriately
            const { data: { user } } = await supabase.auth.getUser();
            let dest = "/discover";
            if (user) {
                const { data: merchant } = await supabase
                    .from("merchants")
                    .select("id")
                    .eq("user_id", user.id)
                    .single();
                if (merchant) dest = "/dashboard";
            }
            setTimeout(() => { window.location.href = dest; }, 2000);
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
                        Nouveau mot de passe
                    </h1>
                    <p className="mt-1 text-sm text-[#8E96B0]">
                        Choisissez un nouveau mot de passe s&eacute;curis&eacute;
                    </p>
                </div>

                {success ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                        <p className="text-sm font-medium text-green-800">Mot de passe mis &agrave; jour !</p>
                        <p className="mt-1 text-xs text-green-600">
                            Redirection en cours...
                        </p>
                    </div>
                ) : !hasSession ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                        <p className="text-sm font-medium text-amber-800">Lien expir&eacute; ou invalide</p>
                        <p className="mt-1 text-xs text-amber-600">
                            Demandez un nouveau lien de r&eacute;initialisation.
                        </p>
                        <Link
                            href="/auth/forgot-password"
                            className="mt-4 inline-block text-sm font-medium text-[#4268FF]"
                        >
                            Renvoyer un lien
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">
                                Nouveau mot de passe
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                placeholder="8 caractères minimum"
                                required
                                minLength={8}
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">
                                Confirmer le mot de passe
                            </label>
                            <input
                                type="password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                placeholder="Confirmer"
                                required
                                minLength={8}
                            />
                        </div>

                        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">{error}</p>}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full rounded-xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90 disabled:opacity-50"
                        >
                            {isLoading ? "Mise à jour..." : "Changer le mot de passe"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

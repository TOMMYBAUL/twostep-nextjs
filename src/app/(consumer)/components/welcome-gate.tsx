"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MarkerPin01, Heart, ShoppingBag01 } from "@untitledui/icons";

const STORAGE_KEY = "ts-welcome-dismissed";

export function WelcomeGate() {
    const [show, setShow] = useState(false);
    const [mode, setMode] = useState<"welcome" | "signup" | "login">("welcome");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Don't show if already dismissed or logged in
        if (localStorage.getItem(STORAGE_KEY)) return;
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) setShow(true);
        }).catch(() => {
            // If auth check fails (no connection, etc.), show welcome anyway
            setShow(true);
        });
    }, []);

    const dismiss = () => {
        localStorage.setItem(STORAGE_KEY, "1");
        setShow(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const supabase = createClient();
            if (mode === "signup") {
                const { error: err } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
                });
                if (err) throw err;
            } else {
                const { error: err } = await supabase.auth.signInWithPassword({ email, password });
                if (err) throw err;
            }
            dismiss();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur");
        } finally {
            setLoading(false);
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm sm:items-center sm:justify-center">
                <div className="w-full rounded-t-3xl bg-primary px-6 pb-8 pt-6 shadow-2xl sm:max-w-sm sm:rounded-3xl">
                    {mode === "welcome" ? (
                        <>
                            {/* Logo */}
                            <div className="mb-6 text-center">
                                <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-[var(--ts-ochre)]">
                                    <ShoppingBag01 className="size-7 text-white" />
                                </div>
                                <h1 className="font-display text-xl font-bold text-primary">
                                    Bienvenue sur Two-Step
                                </h1>
                                <p className="mt-1 text-sm text-tertiary">
                                    Le produit exact que tu cherches, à deux pas de chez toi.
                                </p>
                            </div>

                            {/* Value props */}
                            <div className="mb-6 space-y-3">
                                <div className="flex items-start gap-3">
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ts-ochre)]/10">
                                        <MarkerPin01 className="size-4 text-[var(--ts-ochre)]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-primary">Découvre les boutiques de ton quartier</p>
                                        <p className="text-xs text-tertiary">Stock réel, mis à jour par les commerçants</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ts-ochre)]/10">
                                        <Heart className="size-4 text-[var(--ts-ochre)]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-primary">Sauvegarde tes favoris</p>
                                        <p className="text-xs text-tertiary">Suis tes boutiques préférées — on te prévient des nouveautés</p>
                                    </div>
                                </div>
                            </div>

                            {/* CTAs */}
                            <button
                                type="button"
                                onClick={() => setMode("signup")}
                                className="w-full rounded-xl bg-[var(--ts-ochre)] py-3 text-sm font-semibold text-white transition duration-100 hover:opacity-90"
                            >
                                Créer un compte
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode("login")}
                                className="mt-2 w-full rounded-xl border border-secondary py-3 text-sm font-medium text-secondary transition duration-100 hover:bg-secondary"
                            >
                                J'ai déjà un compte
                            </button>
                            <button
                                type="button"
                                onClick={dismiss}
                                className="mt-3 w-full py-2 text-xs text-tertiary transition duration-100 hover:text-secondary"
                            >
                                Passer pour le moment
                            </button>
                        </>
                    ) : (
                        <>
                            <h2 className="mb-4 text-center text-lg font-bold text-primary">
                                {mode === "signup" ? "Créer un compte" : "Se connecter"}
                            </h2>

                            {error && (
                                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-secondary">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full rounded-xl border border-secondary bg-primary px-3 py-2.5 text-sm text-primary outline-none focus:border-[var(--ts-ochre)]"
                                        placeholder="ton@email.fr"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-secondary">Mot de passe</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full rounded-xl border border-secondary bg-primary px-3 py-2.5 text-sm text-primary outline-none focus:border-[var(--ts-ochre)]"
                                        placeholder={mode === "signup" ? "8 caractères minimum" : "••••••••"}
                                        required
                                        minLength={mode === "signup" ? 8 : undefined}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full rounded-xl bg-[var(--ts-ochre)] py-3 text-sm font-semibold text-white transition duration-100 hover:opacity-90 disabled:opacity-50"
                                >
                                    {loading ? "Chargement..." : mode === "signup" ? "S'inscrire" : "Se connecter"}
                                </button>
                            </form>

                            <div className="mt-3 flex justify-between">
                                <button
                                    type="button"
                                    onClick={() => { setMode("welcome"); setError(""); }}
                                    className="text-xs text-tertiary hover:text-secondary"
                                >
                                    ← Retour
                                </button>
                                <button
                                    type="button"
                                    onClick={dismiss}
                                    className="text-xs text-tertiary hover:text-secondary"
                                >
                                    Passer
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
    );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);
        try {
            const supabase = createClient();
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
            if (authError) throw authError;
            // Check if user is a merchant
            const { data: merchant } = await supabase
                .from("merchants")
                .select("id")
                .eq("user_id", authData.user.id)
                .single();
            window.location.href = merchant ? "/dashboard" : "/discover";
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erreur de connexion";
            setError(msg === "Invalid login credentials" ? "Email ou mot de passe incorrect" : msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-dvh items-center justify-center bg-[#F8F9FC] px-4">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="mb-8 text-center">
                    <img src="/logo-icon.webp?v=2" alt="Two-Step" className="mx-auto mb-3 size-12 rounded-xl" />
                    <h1 className="font-display text-xl font-semibold uppercase text-[#1A1F36]">Connexion</h1>
                    <p className="mt-1 text-sm text-[#8E96B0]">Commerçant ou client, un seul compte</p>
                </div>

                {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">{error}</p>}

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Email</label>
                        <input
                            type="email"
                            name="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                            placeholder="vous@boutique.fr"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Mot de passe</label>
                        <input
                            type="password"
                            name="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                            placeholder="Votre mot de passe"
                            required
                        />
                    </div>

                    <button type="submit" disabled={isLoading} className="w-full rounded-xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90 disabled:opacity-50">
                        {isLoading ? "Connexion..." : "Se connecter"}
                    </button>
                </form>

                <p className="mt-3 text-center">
                    <Link href="/auth/forgot-password" className="text-sm text-[#8E96B0] hover:text-[#1A1F36]">
                        Mot de passe oublié ?
                    </Link>
                </p>
                <p className="mt-4 text-center text-sm text-[#8E96B0]">
                    Pas encore de compte ?{" "}
                    <Link href="/auth/signup" className="font-medium text-[#4268FF]">
                        Inscrivez-vous
                    </Link>
                </p>
            </div>
        </div>
    );
}

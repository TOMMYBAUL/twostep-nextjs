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
            const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
            if (authError) throw authError;
            window.location.href = "/dashboard";
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erreur de connexion";
            setError(msg === "Invalid login credentials" ? "Email ou mot de passe incorrect" : msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--ts-bg-warm)" }}>
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="mb-8 text-center">
                    <img src="/logo-icon.webp" alt="Two-Step" className="mx-auto mb-3 size-12 rounded-xl" />
                    <h1 className="font-display text-xl font-semibold" style={{ color: "var(--ts-dark)" }}>Connexion</h1>
                    <p className="mt-1 text-sm text-gray-400">Accédez à votre dashboard marchand</p>
                </div>

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
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Mot de passe</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="search-ts w-full"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button type="submit" className="btn-ts w-full" disabled={isLoading}>
                        {isLoading ? "Connexion..." : "Se connecter"}
                    </button>
                </form>

                <p className="mt-3 text-center">
                    <Link href="/auth/forgot-password" className="text-sm text-gray-400 hover:text-gray-600">
                        Mot de passe oublié ?
                    </Link>
                </p>
                <p className="mt-4 text-center text-sm text-gray-400">
                    Pas encore de compte ?{" "}
                    <Link href="/auth/signup" className="font-medium" style={{ color: "var(--ts-terracotta)" }}>
                        Inscrivez-vous
                    </Link>
                </p>
            </div>
        </div>
    );
}

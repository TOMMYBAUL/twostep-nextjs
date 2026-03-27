"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Step = "account" | "siret" | "profile";

interface CompanyInfo {
    name: string;
    address: string;
    city: string;
    postalCode: string;
}

export default function SignupPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("account");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Step 1
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Step 2
    const [siret, setSiret] = useState("");
    const [company, setCompany] = useState<CompanyInfo | null>(null);
    const [siretPending, setSiretPending] = useState(false);

    // Step 3
    const [storeName, setStoreName] = useState("");
    const [storeAddress, setStoreAddress] = useState("");
    const [storeCity, setStoreCity] = useState("");
    const [phone, setPhone] = useState("");

    const handleAccountSubmit = (e: FormEvent) => {
        e.preventDefault();
        setError("");
        if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères"); return; }
        if (password !== confirmPassword) { setError("Les mots de passe ne correspondent pas"); return; }
        setStep("siret");
    };

    const handleSiretVerify = async () => {
        setError("");
        setIsLoading(true);
        try {
            const res = await fetch("/api/auth/verify-siret", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siret }),
            });
            const data = await res.json();
            if (!res.ok && res.status === 404) {
                setError("SIRET introuvable. Vérifiez le numéro.");
                return;
            }
            if (data.company) {
                setCompany(data.company);
                setStoreName(data.company.name);
                setStoreAddress(data.company.address);
                setStoreCity(data.company.city);
            }
            setSiretPending(data.pending ?? false);
            setStep("profile");
        } catch {
            setError("Erreur de vérification");
        } finally {
            setIsLoading(false);
        }
    };

    const handleProfileSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        if (!storeName.trim()) { setError("Le nom de la boutique est requis"); return; }
        setIsLoading(true);
        try {
            // 1. Create Supabase account
            const supabase = createClient();
            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
            });
            if (signUpError) throw signUpError;

            // 2. Create merchant profile
            const res = await fetch("/api/merchants", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: storeName,
                    address: storeAddress,
                    city: storeCity,
                    lat: 0,
                    lng: 0,
                    siret,
                    phone: phone || null,
                    status: siretPending ? "pending" : "active",
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error);
            }

            router.push("/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur lors de l'inscription");
        } finally {
            setIsLoading(false);
        }
    };

    // Suppress unused variable warning
    void company;

    return (
        <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--ts-bg-warm)" }}>
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="mb-8 text-center">
                    <img src="/logo-icon.webp" alt="Two-Step" className="mx-auto mb-3 size-12 rounded-xl" />
                    <h1 className="font-display text-xl font-semibold" style={{ color: "var(--ts-dark)" }}>Inscription marchand</h1>
                    {/* Step indicator */}
                    <div className="mt-4 flex justify-center gap-2">
                        {(["account", "siret", "profile"] as Step[]).map((s, i) => (
                            <div
                                key={s}
                                className={`h-1.5 w-12 rounded-full ${
                                    step === s ? "bg-[var(--ts-terracotta)]"
                                    : (["account", "siret", "profile"].indexOf(step) > i) ? "bg-[var(--ts-terracotta)]/40"
                                    : "bg-gray-200"
                                }`}
                            />
                        ))}
                    </div>
                </div>

                {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

                {/* Step 1: Account */}
                {step === "account" && (
                    <form onSubmit={handleAccountSubmit} className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="search-ts w-full" required />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Mot de passe</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="search-ts w-full" required />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Confirmer</label>
                            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="search-ts w-full" required />
                        </div>
                        <button type="submit" className="btn-ts w-full">Continuer</button>
                    </form>
                )}

                {/* Step 2: SIRET */}
                {step === "siret" && (
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Numéro SIRET</label>
                            <input
                                type="text"
                                value={siret}
                                onChange={(e) => setSiret(e.target.value.replace(/\D/g, "").slice(0, 14))}
                                className="search-ts w-full"
                                placeholder="14 chiffres"
                                maxLength={14}
                            />
                            <p className="mt-1 text-xs text-gray-400">Le SIRET permet de vérifier que vous êtes un commerce enregistré</p>
                        </div>
                        <button
                            onClick={handleSiretVerify}
                            className="btn-ts w-full"
                            disabled={siret.length !== 14 || isLoading}
                        >
                            {isLoading ? "Vérification..." : "Vérifier"}
                        </button>
                        <button onClick={() => setStep("account")} className="w-full text-center text-xs text-gray-400">
                            ← Retour
                        </button>
                    </div>
                )}

                {/* Step 3: Profile */}
                {step === "profile" && (
                    <form onSubmit={handleProfileSubmit} className="space-y-4">
                        {siretPending && (
                            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                SIRET en attente de vérification. Vous pourrez utiliser le dashboard en lecture seule.
                            </div>
                        )}
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Nom de la boutique</label>
                            <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="search-ts w-full" required />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Adresse</label>
                            <input type="text" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} className="search-ts w-full" />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Ville</label>
                            <input type="text" value={storeCity} onChange={(e) => setStoreCity(e.target.value)} className="search-ts w-full" />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Téléphone</label>
                            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="search-ts w-full" placeholder="06 12 34 56 78" />
                        </div>
                        <button type="submit" className="btn-ts w-full" disabled={isLoading}>
                            {isLoading ? "Inscription..." : "Créer mon compte"}
                        </button>
                        <button type="button" onClick={() => setStep("siret")} className="w-full text-center text-xs text-gray-400">
                            ← Retour
                        </button>
                    </form>
                )}

                <p className="mt-6 text-center text-sm text-gray-400">
                    Déjà inscrit ?{" "}
                    <Link href="/auth/login" className="font-medium" style={{ color: "var(--ts-terracotta)" }}>
                        Connectez-vous
                    </Link>
                </p>
            </div>
        </div>
    );
}

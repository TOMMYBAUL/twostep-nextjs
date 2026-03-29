"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "user" | "merchant";
type MerchantStep = "account" | "siret" | "profile";

interface CompanyInfo {
    name: string;
    address: string;
    city: string;
    postalCode: string;
}

export default function SignupPage() {
    const router = useRouter();
    const [role, setRole] = useState<Role | null>(null);
    const [step, setStep] = useState<MerchantStep>("account");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Account fields (shared)
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Merchant: SIRET
    const [siret, setSiret] = useState("");
    const [company, setCompany] = useState<CompanyInfo | null>(null);
    const [siretPending, setSiretPending] = useState(false);

    // Merchant: Profile
    const [storeName, setStoreName] = useState("");
    const [storeAddress, setStoreAddress] = useState("");
    const [storeCity, setStoreCity] = useState("");
    const [phone, setPhone] = useState("");

    // ── User signup ──
    const handleUserSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères"); return; }
        if (password !== confirmPassword) { setError("Les mots de passe ne correspondent pas"); return; }
        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
            });
            if (signUpError) throw signUpError;
            router.push("/discover");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur lors de l'inscription");
        } finally {
            setIsLoading(false);
        }
    };

    // ── Merchant: step 1 → step 2 ──
    const handleAccountSubmit = (e: FormEvent) => {
        e.preventDefault();
        setError("");
        if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères"); return; }
        if (password !== confirmPassword) { setError("Les mots de passe ne correspondent pas"); return; }
        setStep("siret");
    };

    // ── Merchant: SIRET verify ──
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

    // ── Merchant: final submit ──
    const handleProfileSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        if (!storeName.trim()) { setError("Le nom de la boutique est requis"); return; }
        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
            });
            if (signUpError) throw signUpError;

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

    void company;

    const merchantStepIndex = ["account", "siret", "profile"].indexOf(step);

    return (
        <div className="flex min-h-dvh items-center justify-center bg-[#F8F9FC] px-4 py-8">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="mb-6 text-center">
                    <img src="/logo-icon.webp?v=2" alt="Two-Step" className="mx-auto mb-3 size-12 rounded-xl" />
                </div>

                {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">{error}</p>}

                {/* ══════════ Role selector ══════════ */}
                {!role && (
                    <>
                        <h1 className="mb-6 text-center font-display text-xl font-bold uppercase text-[#1A1F36]">Créer un compte</h1>
                        <div className="space-y-3">
                            <button
                                type="button"
                                onClick={() => setRole("user")}
                                className="flex w-full items-center gap-4 rounded-2xl bg-white px-5 py-4 text-left shadow-sm transition active:scale-[0.98]"
                            >
                                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#4268FF]/10 text-lg">🛍️</span>
                                <div>
                                    <p className="text-sm font-semibold text-[#1A1F36]">Je suis un acheteur</p>
                                    <p className="mt-0.5 text-xs text-[#8E96B0]">Découvrir les boutiques et produits près de chez moi</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setRole("merchant")}
                                className="flex w-full items-center gap-4 rounded-2xl bg-white px-5 py-4 text-left shadow-sm transition active:scale-[0.98]"
                            >
                                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#4268FF]/10 text-lg">🏪</span>
                                <div>
                                    <p className="text-sm font-semibold text-[#1A1F36]">Je suis un commerçant</p>
                                    <p className="mt-0.5 text-xs text-[#8E96B0]">Rendre mon stock visible aux clients du quartier</p>
                                </div>
                            </button>
                        </div>
                    </>
                )}

                {/* ══════════ User signup ══════════ */}
                {role === "user" && (
                    <>
                        <h1 className="mb-1 text-center font-display text-xl font-bold uppercase text-[#1A1F36]">Inscription</h1>
                        <p className="mb-6 text-center text-xs text-[#8E96B0]">Créez votre compte en quelques secondes</p>

                        <form onSubmit={handleUserSubmit} className="space-y-3">
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                    placeholder="ton@email.fr"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Mot de passe</label>
                                <input
                                    type="password"
                                    name="password"
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                    placeholder="8 caractères minimum"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Confirmer le mot de passe</label>
                                <input
                                    type="password"
                                    name="confirm-password"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                    placeholder="Confirmer"
                                    required
                                />
                            </div>
                            <button type="submit" disabled={isLoading} className="w-full rounded-xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90 disabled:opacity-50">
                                {isLoading ? "Inscription..." : "Créer mon compte"}
                            </button>
                        </form>

                        <button type="button" onClick={() => { setRole(null); setError(""); }} className="mt-4 w-full text-center text-xs text-[#8E96B0]">
                            ← Retour au choix
                        </button>
                    </>
                )}

                {/* ══════════ Merchant signup ══════════ */}
                {role === "merchant" && (
                    <>
                        <h1 className="mb-1 text-center font-display text-xl font-bold uppercase text-[#1A1F36]">Inscription marchand</h1>
                        <p className="mb-4 text-center text-xs text-[#8E96B0]">3 étapes rapides pour démarrer</p>

                        {/* Step indicator */}
                        <div className="mb-6 flex justify-center gap-2">
                            {["account", "siret", "profile"].map((s, i) => (
                                <div
                                    key={s}
                                    className={`h-1.5 w-12 rounded-full transition-all ${
                                        merchantStepIndex === i ? "bg-[#4268FF]"
                                        : merchantStepIndex > i ? "bg-[#4268FF]/40"
                                        : "bg-[#E2E5F0]"
                                    }`}
                                />
                            ))}
                        </div>

                        {/* Step 1: Account */}
                        {step === "account" && (
                            <form onSubmit={handleAccountSubmit} className="space-y-3">
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Email</label>
                                    <input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]" placeholder="vous@boutique.fr" required />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Mot de passe</label>
                                    <input type="password" name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]" placeholder="8 caractères minimum" required />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Confirmer le mot de passe</label>
                                    <input type="password" name="confirm-password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]" placeholder="Confirmer" required />
                                </div>
                                <button type="submit" className="w-full rounded-xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90">Continuer</button>
                                <button type="button" onClick={() => { setRole(null); setError(""); }} className="w-full text-center text-xs text-[#8E96B0]">← Retour au choix</button>
                            </form>
                        )}

                        {/* Step 2: SIRET */}
                        {step === "siret" && (
                            <div className="space-y-3">
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Numéro SIRET</label>
                                    <input
                                        type="text"
                                        value={siret}
                                        onChange={(e) => setSiret(e.target.value.replace(/\D/g, "").slice(0, 14))}
                                        className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                        placeholder="14 chiffres"
                                        maxLength={14}
                                    />
                                    <p className="mt-1.5 text-[11px] text-[#8E96B0]">Le SIRET permet de vérifier que vous êtes un commerce enregistré</p>
                                </div>
                                <button onClick={handleSiretVerify} disabled={siret.length !== 14 || isLoading} className="w-full rounded-xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90 disabled:opacity-50">
                                    {isLoading ? "Vérification..." : "Vérifier"}
                                </button>
                                <button type="button" onClick={() => { setStep("account"); setError(""); }} className="w-full text-center text-xs text-[#8E96B0]">← Retour</button>
                            </div>
                        )}

                        {/* Step 3: Profile */}
                        {step === "profile" && (
                            <form onSubmit={handleProfileSubmit} className="space-y-3">
                                {siretPending && (
                                    <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
                                        SIRET en attente de vérification. Vous pourrez utiliser le dashboard en lecture seule.
                                    </div>
                                )}
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Nom de la boutique</label>
                                    <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]" required />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Adresse</label>
                                    <input type="text" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]" />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Ville</label>
                                    <input type="text" value={storeCity} onChange={(e) => setStoreCity(e.target.value)} className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]" />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Téléphone</label>
                                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition focus:border-[#4268FF] focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]" placeholder="06 12 34 56 78" />
                                </div>
                                <button type="submit" disabled={isLoading} className="w-full rounded-xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90 disabled:opacity-50">
                                    {isLoading ? "Inscription..." : "Créer mon compte"}
                                </button>
                                <button type="button" onClick={() => { setStep("siret"); setError(""); }} className="w-full text-center text-xs text-[#8E96B0]">← Retour</button>
                            </form>
                        )}
                    </>
                )}

                <p className="mt-6 text-center text-sm text-[#8E96B0]">
                    Déjà inscrit ?{" "}
                    <Link href="/auth/login" className="font-medium text-[#4268FF]">
                        Connectez-vous
                    </Link>
                </p>
            </div>
        </div>
    );
}

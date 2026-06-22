"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { captureError } from "@/lib/error";

interface CompanyInfo {
    name: string;
    address: string;
    city: string;
    postalCode: string;
}

type Step = "siret" | "profile";

export function BecomeMerchantForm({ userEmail }: { userEmail: string }) {
    const router = useRouter();
    const [step, setStep] = useState<Step>("siret");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const [siret, setSiret] = useState("");
    const [company, setCompany] = useState<CompanyInfo | null>(null);
    const [siretPending, setSiretPending] = useState(false);

    const [storeName, setStoreName] = useState("");
    const [storeAddress, setStoreAddress] = useState("");
    const [storeCity, setStoreCity] = useState("");
    const [phone, setPhone] = useState("");

    // Restore prefill from signup attempt if the user was redirected here
    // after a "repeated signup" flow.
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem("merchant_prefill");
            if (!raw) return;
            const p = JSON.parse(raw) as Record<string, string>;
            if (p.siret) setSiret(p.siret);
            if (p.name) setStoreName(p.name);
            if (p.address) setStoreAddress(p.address);
            if (p.city) setStoreCity(p.city);
            if (p.phone) setPhone(p.phone);
            setSiretPending(p.siret_pending === "1");
            if (p.siret && p.name) setStep("profile");
            sessionStorage.removeItem("merchant_prefill");
        } catch {
            // ignore parse errors
        }
    }, []);

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
            if (!res.ok) {
                // SIRET rejeté (introuvable / fermé / format) — l'API répond 400 avec un motif.
                setError(data.error ?? "SIRET invalide. Vérifiez le numéro.");
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
        } catch (err) {
            // Échec réseau / réponse non-JSON : rendu visible (Sentry), pas juste un message UI.
            captureError(err, { phase: "handleSiretVerify", form: "devenir-marchand" });
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
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error ?? "Erreur");
            }
            router.push("/dashboard");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
        } finally {
            setIsLoading(false);
        }
    };

    void company;

    return (
        <div className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-8">
            <div className="w-full max-w-sm">
                <div className="mb-6 text-center">
                    <img src="/logo-icon.webp?v=2" alt="Two-Step" className="mx-auto mb-3 size-12 rounded-xl" />
                    <h1 className="font-display text-xl font-bold uppercase text-primary">Ajoute ta boutique</h1>
                    <p className="mt-1 text-xs text-tertiary">Connecté en tant que {userEmail}</p>
                </div>

                {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">{error}</p>}

                {step === "siret" && (
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-primary">Numéro SIRET (14 chiffres)</label>
                            <input
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={siret}
                                onChange={(e) => setSiret(e.target.value.replace(/\D/g, "").slice(0, 14))}
                                className="w-full rounded-xl border border-secondary bg-white px-4 py-3 text-sm text-primary outline-none transition focus:border-brand focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                placeholder="12345678900012"
                                required
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleSiretVerify}
                            disabled={isLoading || siret.length !== 14}
                            className="w-full rounded-xl bg-brand-solid py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90 disabled:opacity-50"
                        >
                            {isLoading ? "Vérification..." : "Vérifier"}
                        </button>
                    </div>
                )}

                {step === "profile" && (
                    <form onSubmit={handleProfileSubmit} className="space-y-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-primary">Nom de la boutique</label>
                            <input
                                value={storeName}
                                onChange={(e) => setStoreName(e.target.value)}
                                className="w-full rounded-xl border border-secondary bg-white px-4 py-3 text-sm text-primary outline-none transition focus:border-brand focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-primary">Adresse</label>
                            <input
                                value={storeAddress}
                                onChange={(e) => setStoreAddress(e.target.value)}
                                className="w-full rounded-xl border border-secondary bg-white px-4 py-3 text-sm text-primary outline-none transition focus:border-brand focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-primary">Ville</label>
                            <input
                                value={storeCity}
                                onChange={(e) => setStoreCity(e.target.value)}
                                className="w-full rounded-xl border border-secondary bg-white px-4 py-3 text-sm text-primary outline-none transition focus:border-brand focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-semibold text-primary">Téléphone (optionnel)</label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full rounded-xl border border-secondary bg-white px-4 py-3 text-sm text-primary outline-none transition focus:border-brand focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                                placeholder="06 12 34 56 78"
                            />
                        </div>
                        {siretPending && (
                            <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
                                SIRET non vérifié automatiquement — ton compte sera marqué en attente et activé après vérification manuelle.
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full rounded-xl bg-brand-solid py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90 disabled:opacity-50"
                        >
                            {isLoading ? "Enregistrement..." : "Enregistrer ma boutique"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

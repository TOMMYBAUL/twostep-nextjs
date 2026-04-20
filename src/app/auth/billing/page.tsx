"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface TierInfo {
    tier: "pioneer" | "early" | "standard";
    name: string;
    description: string;
    priceEuros: number;
    activeCount: number;
    remainingInTier: number | null;
    pioneerCap: number;
    earlyCap: number;
    trialDays: number;
}

export default function BillingPage() {
    const searchParams = useSearchParams();
    const canceled = searchParams.get("canceled") === "1";

    const [info, setInfo] = useState<TierInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const fetchInfo = async () => {
            try {
                const res = await fetch("/api/stripe/tier-info");
                if (!res.ok) throw new Error("Impossible de charger les tarifs");
                setInfo(await res.json());
            } catch (err) {
                setError(err instanceof Error ? err.message : "Erreur");
            } finally {
                setLoading(false);
            }
        };
        fetchInfo();
    }, []);

    const startCheckout = async () => {
        setError("");
        setSubmitting(true);
        try {
            const res = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Checkout impossible");
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error("Lien Checkout manquant");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur");
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-secondary px-4">
                <p className="text-sm text-tertiary">Chargement…</p>
            </div>
        );
    }

    if (!info) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-secondary px-4">
                <p className="text-sm text-red-600">{error || "Erreur inattendue"}</p>
            </div>
        );
    }

    const tierColor =
        info.tier === "pioneer" ? "bg-[#4268FF]" :
        info.tier === "early" ? "bg-amber-500" : "bg-slate-600";

    return (
        <div className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-8">
            <div className="w-full max-w-md">
                <div className="mb-6 text-center">
                    <img src="/logo-icon.webp?v=2" alt="Two-Step" className="mx-auto mb-3 size-12 rounded-xl" />
                </div>

                {canceled && (
                    <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700">
                        Abonnement non finalisé. Tu peux réessayer quand tu veux.
                    </p>
                )}

                {error && (
                    <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">
                        {error}
                    </p>
                )}

                <div className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <span className={`inline-block size-2 rounded-full ${tierColor}`} />
                        <span className="text-xs font-semibold uppercase tracking-wide text-tertiary">
                            Tarif {info.name}
                        </span>
                    </div>

                    <h1 className="mb-2 font-display text-2xl font-bold uppercase text-primary">
                        {info.trialDays} jours gratuits
                    </h1>
                    <p className="mb-6 text-sm text-tertiary">
                        Puis {info.priceEuros}€/mois — {info.description}
                    </p>

                    {info.tier === "pioneer" && info.remainingInTier !== null && (
                        <div className="mb-6 rounded-xl bg-[#4268FF]/10 px-4 py-3">
                            <p className="text-xs font-semibold text-[#4268FF]">
                                Plus que {info.remainingInTier} place{info.remainingInTier > 1 ? "s" : ""} au tarif Pionnier
                            </p>
                            <p className="mt-1 text-[11px] text-tertiary">
                                Tu seras le {info.activeCount + 1}ᵉ marchand — tarif verrouillé à vie
                            </p>
                        </div>
                    )}

                    {info.tier === "early" && info.remainingInTier !== null && (
                        <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3">
                            <p className="text-xs font-semibold text-amber-700">
                                Plus que {info.remainingInTier} place{info.remainingInTier > 1 ? "s" : ""} au tarif Early Adopter
                            </p>
                            <p className="mt-1 text-[11px] text-tertiary">
                                Tu seras le {info.activeCount + 1}ᵉ marchand — tarif verrouillé à vie
                            </p>
                        </div>
                    )}

                    <ul className="mb-6 space-y-2 text-sm text-primary">
                        <li className="flex gap-2"><span>✓</span> Ta boutique visible dans l'app Two-Step</li>
                        <li className="flex gap-2"><span>✓</span> Dashboard complet (stock, factures, clients)</li>
                        <li className="flex gap-2"><span>✓</span> Synchronisation POS (Square, Shopify, Lightspeed)</li>
                        <li className="flex gap-2"><span>✓</span> Annulation en 1 clic à tout moment</li>
                    </ul>

                    <button
                        onClick={startCheckout}
                        disabled={submitting}
                        className="w-full rounded-xl bg-brand-solid py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90 disabled:opacity-50"
                    >
                        {submitting ? "Redirection…" : `Démarrer mes ${info.trialDays} jours gratuits`}
                    </button>

                    <p className="mt-3 text-center text-[11px] text-tertiary">
                        CB requise. Tu ne seras débité qu'à J+{info.trialDays}.
                        Annulation possible à tout moment depuis ton dashboard.
                    </p>
                </div>
            </div>
        </div>
    );
}

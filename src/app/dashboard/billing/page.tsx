"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type BillingStatus =
    | "pending"
    | "trialing"
    | "active"
    | "payment_required"
    | "canceled";

interface BillingSnapshot {
    plan: string | null;
    billingStatus: BillingStatus;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
}

const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
        });
    } catch {
        return "—";
    }
};

const planLabel = (plan: string | null) => {
    switch (plan) {
        case "pioneer": return "Pionnier (19€/mois)";
        case "early": return "Early Adopter (29€/mois)";
        case "standard": return "Standard (39€/mois)";
        default: return "—";
    }
};

const statusBadge = (status: BillingStatus) => {
    switch (status) {
        case "trialing": return { label: "Essai gratuit", color: "bg-blue-100 text-blue-700" };
        case "active": return { label: "Actif", color: "bg-emerald-100 text-emerald-700" };
        case "payment_required": return { label: "Paiement requis", color: "bg-red-100 text-red-700" };
        case "canceled": return { label: "Annulé", color: "bg-slate-100 text-slate-700" };
        case "pending": return { label: "En attente", color: "bg-amber-100 text-amber-700" };
    }
};

export default function DashboardBillingPage() {
    const searchParams = useSearchParams();
    const paymentRequiredHint = searchParams.get("payment_required") === "1";

    const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [openingPortal, setOpeningPortal] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    window.location.href = "/auth/login";
                    return;
                }
                const { data: merchant } = await supabase
                    .from("merchants")
                    .select("plan, billing_status, trial_ends_at, current_period_end")
                    .eq("user_id", user.id)
                    .maybeSingle();
                if (!merchant) {
                    setError("Profil marchand introuvable");
                    return;
                }
                setSnapshot({
                    plan: merchant.plan ?? null,
                    billingStatus: (merchant.billing_status ?? "pending") as BillingStatus,
                    trialEndsAt: merchant.trial_ends_at ?? null,
                    currentPeriodEnd: merchant.current_period_end ?? null,
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : "Erreur");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const openPortal = async () => {
        setError("");
        setOpeningPortal(true);
        try {
            const res = await fetch("/api/stripe/portal", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Impossible d'ouvrir le portail");
            window.location.href = data.url;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur");
            setOpeningPortal(false);
        }
    };

    if (loading) {
        return <p className="text-sm text-tertiary">Chargement…</p>;
    }

    if (!snapshot) {
        return <p className="text-sm text-red-600">{error || "Erreur inattendue"}</p>;
    }

    const badge = statusBadge(snapshot.billingStatus);
    const nextBillingDate =
        snapshot.billingStatus === "trialing" ? snapshot.trialEndsAt : snapshot.currentPeriodEnd;

    return (
        <div className="mx-auto max-w-2xl">
            <h1 className="mb-1 font-display text-2xl font-bold uppercase text-primary">Facturation</h1>
            <p className="mb-6 text-sm text-tertiary">Gère ton abonnement, ta CB et tes factures</p>

            {paymentRequiredHint && (
                <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    Ton dernier paiement a échoué. Mets à jour ta carte dans le portail ci-dessous
                    pour débloquer ton dashboard.
                </div>
            )}

            {error && (
                <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="mb-4 rounded-2xl bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-tertiary">Statut</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.color}`}>
                        {badge.label}
                    </span>
                </div>

                <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                        <dt className="text-tertiary">Plan</dt>
                        <dd className="font-medium text-primary">{planLabel(snapshot.plan)}</dd>
                    </div>
                    <div className="flex justify-between">
                        <dt className="text-tertiary">
                            {snapshot.billingStatus === "trialing" ? "Fin de l'essai" : "Prochaine échéance"}
                        </dt>
                        <dd className="font-medium text-primary">{formatDate(nextBillingDate)}</dd>
                    </div>
                </dl>
            </div>

            <button
                onClick={openPortal}
                disabled={openingPortal}
                className="w-full rounded-xl bg-brand-solid py-3.5 text-sm font-bold text-white shadow-sm transition active:opacity-90 disabled:opacity-50"
            >
                {openingPortal ? "Ouverture…" : "Gérer mon abonnement"}
            </button>
            <p className="mt-3 text-center text-[11px] text-tertiary">
                Le portail Stripe permet de mettre à jour ta carte, télécharger tes factures, ou annuler.
            </p>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { PageHeader } from "@/components/dashboard/page-header";

type GoogleConnection = {
    google_merchant_id: string;
    products_pushed: number;
    last_feed_at: string | null;
    last_feed_status: string;
    last_feed_error: string | null;
    store_code: string;
};

type GoogleStats = {
    total_visible: number;
    eligible_google: number;
    missing_ean: number;
    missing_photo: number;
    missing_price: number;
    score: number;
};

export default function GooglePage() {
    const { merchant } = useMerchant();
    const [connection, setConnection] = useState<GoogleConnection | null>(null);
    const [stats, setStats] = useState<GoogleStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);

    useEffect(() => {
        if (!merchant?.id) return;

        const supabase = createClient();

        // Load connection + stats in parallel
        Promise.all([
            supabase
                .from("google_merchant_connections")
                .select("google_merchant_id, products_pushed, last_feed_at, last_feed_status, last_feed_error, store_code")
                .eq("merchant_id", merchant.id)
                .maybeSingle()
                .then(({ data }: { data: GoogleConnection | null }) => data),
            fetch("/api/google/stats").then((r) => r.json()),
        ]).then(([conn, statsData]) => {
            setConnection(conn);
            if (!statsData.error) setStats(statsData);
            setLoading(false);
        }).catch(() => {
            setLoading(false);
        });
    }, [merchant?.id]);

    async function handleConnect() {
        const res = await fetch("/api/google/auth");
        const { auth_url } = await res.json();
        if (auth_url) window.location.href = auth_url;
    }

    async function handleDisconnect() {
        setDisconnecting(true);
        await fetch("/api/google/disconnect", { method: "POST" });
        setConnection(null);
        setStats(null);
        setDisconnecting(false);
    }

    function formatTimeAgo(dateStr: string): string {
        const diff = Date.now() - new Date(dateStr).getTime();
        const hours = Math.floor(diff / 3_600_000);
        if (hours < 1) return "il y a moins d'1h";
        if (hours < 24) return `il y a ${hours}h`;
        const days = Math.floor(hours / 24);
        return `il y a ${days}j`;
    }

    if (loading) {
        return (
            <>
                <PageHeader title="Google" storeName={merchant?.name} />
                <div className="mt-8 text-center text-sm text-tertiary">Chargement...</div>
            </>
        );
    }

    const suggestions: Array<{ count: number; label: string; colorClass: string }> = [];
    if (stats) {
        if (stats.missing_photo > 0) suggestions.push({ count: stats.missing_photo, label: "produits sans photo — ajoutez une photo pour les rendre visibles", colorClass: "text-warning-primary" });
        if (stats.missing_ean > 0) suggestions.push({ count: stats.missing_ean, label: "produits sans code-barres — complétez-les dans votre caisse", colorClass: "text-error-primary" });
        if (stats.missing_price > 0) suggestions.push({ count: stats.missing_price, label: "produits sans prix — ajoutez un prix pour les rendre visibles", colorClass: "text-warning-primary" });
    }

    return (
        <>
            <PageHeader title="Google" storeName={merchant?.name} />

            <div className="mx-auto mt-6 max-w-lg space-y-4">
                {/* Score de visibilité — toujours visible */}
                {stats && stats.total_visible > 0 && (
                    <div className="rounded-2xl border border-secondary bg-primary p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-tertiary">Visibilité Google</p>
                                <p className="mt-0.5 text-xs text-tertiary">
                                    {stats.eligible_google} / {stats.total_visible} produits éligibles
                                </p>
                            </div>
                            <p className={`text-3xl font-bold ${stats.score >= 70 ? "text-success-primary" : stats.score >= 40 ? "text-warning-primary" : "text-error-primary"}`}>
                                {stats.score}%
                            </p>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${stats.score >= 70 ? "bg-success-solid" : stats.score >= 40 ? "bg-warning-solid" : "bg-error-solid"}`}
                                style={{ width: `${stats.score}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Suggestions */}
                {suggestions.length > 0 && (
                    <div className="rounded-2xl border border-secondary bg-primary p-6">
                        <p className="mb-3 text-sm font-semibold text-primary">Suggestions</p>
                        <div className="space-y-2">
                            {suggestions.map((s, i) => (
                                <div key={i} className="rounded-xl bg-warning-secondary px-4 py-3">
                                    <p className="text-xs text-primary">
                                        <span className={`font-bold ${s.colorClass}`}>+{s.count}</span>{" "}
                                        {s.label}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Connexion Google */}
                {!connection ? (
                    <div className="rounded-2xl border border-secondary bg-primary p-8 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-secondary">
                            <svg aria-hidden="true" className="h-7 w-7 text-[#4285F4]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-semibold text-primary">
                            Connectez-vous à Google
                        </h2>
                        <p className="mt-2 text-sm text-tertiary">
                            {stats && stats.eligible_google > 0
                                ? `${stats.eligible_google} produits seront visibles immédiatement sur Google Shopping et Google Maps.`
                                : "Vos produits apparaîtront gratuitement sur Google Shopping et Google Maps quand un client cherche un produit près de chez vous."}
                        </p>
                        <button
                            onClick={handleConnect}
                            className="mt-6 rounded-xl bg-[#4285F4] px-6 py-3 min-h-[44px] text-sm font-medium text-white transition hover:bg-[#3367D6] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            Connecter à Google
                        </button>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-secondary bg-primary p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                                <svg aria-hidden="true" className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-semibold text-primary">Connecté à Google</p>
                                <p className="text-xs text-tertiary">
                                    Merchant ID : {connection.google_merchant_id}
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                                <span className="text-xs text-tertiary">Produits envoyés</span>
                                <span className="text-sm font-semibold text-primary">{connection.products_pushed}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                                <span className="text-xs text-tertiary">Dernière sync</span>
                                <span className="text-sm font-semibold text-primary">
                                    {connection.last_feed_at ? formatTimeAgo(connection.last_feed_at) : "En attente"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                                <span className="text-xs text-tertiary">Statut</span>
                                <span className={`text-sm font-semibold ${
                                    connection.last_feed_status === "success" ? "text-success-primary"
                                        : connection.last_feed_status === "error" ? "text-error-primary"
                                            : "text-tertiary"
                                }`}>
                                    {connection.last_feed_status === "success" ? "Succès"
                                        : connection.last_feed_status === "error" ? `Erreur : ${connection.last_feed_error ?? "inconnue"}`
                                            : "En attente"}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                            className="mt-4 text-xs text-error-primary transition hover:text-error-primary disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded"
                        >
                            {disconnecting ? "Déconnexion..." : "Déconnecter de Google"}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}

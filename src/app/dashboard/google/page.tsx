"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { PageHeader } from "@/components/dashboard/page-header";
import {
    deriveStatsView,
    deriveConnectionView,
    type StatsView,
    type ConnectionView,
    type GoogleStatsData,
    type GoogleConnectionData,
} from "@/lib/google/dashboard-view";

export default function GooglePage() {
    const { merchant, loading: merchantLoading, error: merchantError } = useMerchant();
    const [statsView, setStatsView] = useState<StatsView | null>(null);
    const [connectionView, setConnectionView] = useState<ConnectionView | null>(null);
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);
    // Erreur d'ACTION (connecter/déconnecter) affichée à côté du bouton — ne pas avaler
    // un échec en silence (le bouton paraîtrait cassé / un faux « déconnecté »).
    const [actionError, setActionError] = useState<string | null>(null);

    const loadData = useCallback(async (merchantId: string) => {
        setLoading(true);
        const supabase = createClient();

        // On GARDE l'error : un blip de lecture ≠ « pas connecté » (cf. deriveConnectionView).
        const connLoad = (async (): Promise<{ error: boolean; connection: GoogleConnectionData | null }> => {
            try {
                const { data, error } = await supabase
                    .from("google_merchant_connections")
                    .select("google_merchant_id, products_pushed, last_feed_at, last_feed_status, last_feed_error, store_code")
                    .eq("merchant_id", merchantId)
                    .maybeSingle();
                return { error: !!error, connection: (data as GoogleConnectionData | null) ?? null };
            } catch {
                return { error: true, connection: null };
            }
        })();

        // On respecte le statut HTTP : un 500 `{error}` ne doit PAS passer pour un état vide.
        const statsLoad = (async (): Promise<{ ok: boolean; stats: GoogleStatsData | null }> => {
            try {
                const r = await fetch("/api/google/stats");
                const body = r.ok ? ((await r.json()) as GoogleStatsData & { error?: string }) : null;
                const ok = r.ok && !!body && !body.error;
                return { ok, stats: ok ? body : null };
            } catch {
                return { ok: false, stats: null };
            }
        })();

        const [conn, stats] = await Promise.all([connLoad, statsLoad]);
        setConnectionView(deriveConnectionView(conn));
        setStatsView(deriveStatsView(stats));
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!merchant?.id) return;
        void loadData(merchant.id);
    }, [merchant?.id, loadData]);

    async function handleConnect() {
        setActionError(null);
        try {
            const res = await fetch("/api/google/auth");
            const body = res.ok ? await res.json().catch(() => null) : null;
            const authUrl = body?.auth_url as string | undefined;
            // res.ok manquant OU pas d'auth_url = échec : le DIRE, ne pas laisser un bouton mort.
            if (!res.ok || !authUrl) {
                setActionError("Impossible d'ouvrir la connexion Google. Réessayez dans un instant.");
                return;
            }
            window.location.href = authUrl;
        } catch {
            // Échec réseau : ne pas corrompre l'état affiché, mais le signaler.
            setActionError("Impossible d'ouvrir la connexion Google. Vérifiez votre connexion.");
        }
    }

    async function handleDisconnect() {
        setConfirmDisconnect(false);
        setDisconnecting(true);
        setActionError(null);
        try {
            const res = await fetch("/api/google/disconnect", { method: "POST" });
            // Un 500 ne doit PAS afficher « déconnecté » alors que la connexion existe encore en base.
            if (!res.ok) {
                setActionError("La déconnexion a échoué. Vos produits sont toujours connectés à Google.");
                return;
            }
            setConnectionView({ kind: "disconnected" });
            setStatsView(null);
        } catch {
            // keep current state on failure
            setActionError("La déconnexion a échoué. Vos produits sont toujours connectés à Google.");
        } finally {
            setDisconnecting(false);
        }
    }

    function formatTimeAgo(dateStr: string): string {
        const diff = Date.now() - new Date(dateStr).getTime();
        const hours = Math.floor(diff / 3_600_000);
        if (hours < 1) return "il y a moins d'1h";
        if (hours < 24) return `il y a ${hours}h`;
        const days = Math.floor(hours / 24);
        return `il y a ${days}j`;
    }

    // Chargement (profil marchand OU données Google) — annoncé aux lecteurs d'écran.
    if (merchantLoading || (merchant?.id && loading)) {
        return (
            <>
                <PageHeader title="Google" storeName={merchant?.name} />
                <div className="mt-8 text-center text-sm text-tertiary" role="status" aria-live="polite">
                    Chargement…
                </div>
            </>
        );
    }

    // Profil marchand introuvable / en erreur → état honnête avec porte de sortie (pas de spinner infini).
    if (merchantError || !merchant?.id) {
        return (
            <>
                <PageHeader title="Google" storeName={merchant?.name} />
                <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-secondary bg-primary p-8 text-center" role="alert">
                    <h2 className="text-lg font-semibold text-primary">Profil boutique indisponible</h2>
                    <p className="mt-2 text-sm text-tertiary">
                        Impossible de charger votre boutique pour le moment. Vérifiez votre connexion puis réessayez.
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-6 rounded-xl bg-brand-solid px-6 py-3 min-h-[44px] text-sm font-medium text-white transition hover:bg-brand-solid_hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                        Réessayer
                    </button>
                </div>
            </>
        );
    }

    return (
        <>
            <PageHeader title="Google" storeName={merchant?.name} />

            <div className="mx-auto mt-6 max-w-lg space-y-4">
                {/* Section visibilité : score, vide (guidage import), ou erreur de chargement honnête. */}
                {statsView?.kind === "error" && (
                    <div className="rounded-2xl border border-secondary bg-primary p-6 text-center" role="alert">
                        <p className="text-sm font-semibold text-primary">Impossible de charger votre visibilité Google</p>
                        <p className="mt-1 text-xs text-tertiary">Une erreur est survenue. Vos produits ne sont pas affectés.</p>
                        <button
                            type="button"
                            onClick={() => merchant?.id && loadData(merchant.id)}
                            className="mt-4 rounded-xl border border-secondary px-4 py-2.5 min-h-[44px] text-sm font-medium text-secondary transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            Réessayer
                        </button>
                    </div>
                )}

                {statsView?.kind === "empty" && (
                    <div className="rounded-2xl border border-secondary bg-primary p-8 text-center">
                        <h2 className="text-lg font-semibold text-primary">Aucun produit visible pour l'instant</h2>
                        <p className="mt-2 text-sm text-tertiary">
                            Importez votre stock pour rendre vos produits visibles sur Google Shopping et Google Maps.
                        </p>
                        <Link
                            href="/dashboard/stock"
                            className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-solid px-6 py-3 min-h-[44px] text-sm font-medium text-white transition hover:bg-brand-solid_hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            Importer mon stock
                        </Link>
                    </div>
                )}

                {statsView?.kind === "stats" && (
                    <>
                        {/* Score de visibilité */}
                        <div className="rounded-2xl border border-secondary bg-primary p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-tertiary">Visibilité Google</p>
                                    <p className="mt-0.5 text-xs text-tertiary">
                                        {statsView.eligible} / {statsView.total} produits éligibles
                                    </p>
                                </div>
                                <p className={`text-3xl font-bold ${statsView.score >= 70 ? "text-success-primary" : statsView.score >= 40 ? "text-warning-primary" : "text-error-primary"}`}>
                                    {statsView.score}%
                                </p>
                            </div>
                            <div
                                className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"
                                role="progressbar"
                                aria-valuenow={statsView.score}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`Score de visibilité Google : ${statsView.score} %`}
                            >
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${statsView.score >= 70 ? "bg-success-solid" : statsView.score >= 40 ? "bg-warning-solid" : "bg-error-solid"}`}
                                    style={{ width: `${statsView.score}%` }}
                                />
                            </div>
                        </div>

                        {/* Suggestions actionnables */}
                        {statsView.suggestions.length > 0 && (
                            <div className="rounded-2xl border border-secondary bg-primary p-6">
                                <p className="mb-3 text-sm font-semibold text-primary">Suggestions</p>
                                <ul className="space-y-2">
                                    {statsView.suggestions.map((s, i) => (
                                        <li key={i} className="rounded-xl bg-warning-secondary px-4 py-3">
                                            <p className="text-xs text-primary">
                                                <span className={`font-bold ${s.tone === "error" ? "text-error-primary" : "text-warning-primary"}`}>+{s.count}</span>{" "}
                                                {s.label}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}

                {/* Section connexion Google : erreur de lecture, déconnecté, ou connecté. */}
                {connectionView?.kind === "error" ? (
                    <div className="rounded-2xl border border-secondary bg-primary p-6 text-center" role="alert">
                        <p className="text-sm font-semibold text-primary">Impossible de vérifier votre connexion Google</p>
                        <p className="mt-1 text-xs text-tertiary">Réessayez dans un instant.</p>
                        <button
                            type="button"
                            onClick={() => merchant?.id && loadData(merchant.id)}
                            className="mt-4 rounded-xl border border-secondary px-4 py-2.5 min-h-[44px] text-sm font-medium text-secondary transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            Réessayer
                        </button>
                    </div>
                ) : connectionView?.kind === "disconnected" ? (
                    <div className="rounded-2xl border border-secondary bg-primary p-8 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-secondary">
                            <svg aria-hidden="true" className="h-7 w-7 text-[#4285F4]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-semibold text-primary">Connectez-vous à Google</h2>
                        <p className="mt-2 text-sm text-tertiary">
                            {statsView?.kind === "stats" && statsView.eligible > 0
                                ? `${statsView.eligible} produits seront visibles immédiatement sur Google Shopping et Google Maps.`
                                : "Vos produits apparaîtront gratuitement sur Google Shopping et Google Maps quand un client cherche un produit près de chez vous."}
                        </p>
                        <button
                            type="button"
                            onClick={handleConnect}
                            className="mt-6 rounded-xl bg-[#4285F4] px-6 py-3 min-h-[44px] text-sm font-medium text-white transition hover:bg-[#3367D6] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            Connecter à Google
                        </button>
                        {actionError && (
                            <p className="mt-3 text-xs font-medium text-error-primary" role="alert">{actionError}</p>
                        )}
                    </div>
                ) : connectionView?.kind === "connected" ? (
                    <div className="rounded-2xl border border-secondary bg-primary p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-secondary">
                                <svg aria-hidden="true" className="h-5 w-5 text-success-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-semibold text-primary">Connecté à Google</p>
                                <p className="text-xs text-tertiary">
                                    Merchant ID : {connectionView.connection.google_merchant_id}
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                                <span className="text-xs text-tertiary">Produits envoyés</span>
                                <span className="text-sm font-semibold text-primary">{connectionView.connection.products_pushed}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                                <span className="text-xs text-tertiary">Dernière sync</span>
                                <span className="text-sm font-semibold text-primary">
                                    {connectionView.connection.last_feed_at ? formatTimeAgo(connectionView.connection.last_feed_at) : "En attente"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                                <span className="text-xs text-tertiary">Statut</span>
                                <span className={`text-sm font-semibold ${
                                    connectionView.connection.last_feed_status === "success" ? "text-success-primary"
                                        : connectionView.connection.last_feed_status === "error" ? "text-error-primary"
                                            : "text-tertiary"
                                }`}>
                                    {connectionView.connection.last_feed_status === "success" ? "Succès"
                                        : connectionView.connection.last_feed_status === "error" ? `Erreur : ${connectionView.connection.last_feed_error ?? "inconnue"}`
                                            : "En attente"}
                                </span>
                            </div>
                        </div>

                        {!confirmDisconnect ? (
                            <button
                                type="button"
                                onClick={() => setConfirmDisconnect(true)}
                                disabled={disconnecting}
                                className="mt-4 text-xs text-error-primary transition hover:text-error-primary disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded"
                            >
                                {disconnecting ? "Déconnexion…" : "Déconnecter de Google"}
                            </button>
                        ) : (
                            <div className="mt-4 flex items-center gap-2 rounded-lg bg-error-secondary px-4 py-2.5">
                                <p className="flex-1 text-xs font-medium text-error-primary">Vos produits ne seront plus visibles sur Google Shopping.</p>
                                <button
                                    type="button"
                                    onClick={handleDisconnect}
                                    className="rounded-lg bg-error-solid px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                                >
                                    Confirmer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConfirmDisconnect(false)}
                                    className="rounded-lg border border-secondary px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-secondary"
                                >
                                    Annuler
                                </button>
                            </div>
                        )}
                        {actionError && (
                            <p className="mt-3 text-xs font-medium text-error-primary" role="alert">{actionError}</p>
                        )}
                    </div>
                ) : null}
            </div>
        </>
    );
}

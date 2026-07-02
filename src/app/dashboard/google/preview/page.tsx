"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMerchant } from "@/hooks/use-merchant";
import { PageHeader } from "@/components/dashboard/page-header";
import {
    deriveFeedPreviewView,
    feedBlockReasonLabel,
    type FeedPreviewView,
    type FeedPreviewData,
    type FeedPreviewItem,
} from "@/lib/google/feed-preview-view";

/**
 * Écran « Aperçu Google » (mode shadow/preview — item onboarding pilote 6a.2).
 *
 * Montre au marchand EXACTEMENT ce qui serait publié sur Google AVANT toute publication : le feed
 * réel produit par produit (parité garantie par l'API `/api/google/feed-preview`), et ce qui est
 * bloqué + pourquoi. C'est l'outil qui rend un pilote onboardable en confiance (il inspecte au lieu
 * de découvrir un catalogue fantôme après coup — ce qui a tué MVMS/Milo). LECTURE SEULE : rien n'est
 * envoyé à Google depuis cet écran.
 */
export default function GoogleFeedPreviewPage() {
    const { merchant, loading: merchantLoading, error: merchantError } = useMerchant();
    const [view, setView] = useState<FeedPreviewView | null>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        // On respecte le statut HTTP : un 500 `{error}` ne doit PAS passer pour un preview vide
        // (« rien à publier » trompeur). Même contrat que la page Google (deriveStatsView).
        const load = await (async (): Promise<{ ok: boolean; data: FeedPreviewData | null }> => {
            try {
                const r = await fetch("/api/google/feed-preview");
                const body = r.ok ? ((await r.json()) as FeedPreviewData & { error?: string }) : null;
                const ok = r.ok && !!body && !body.error;
                return { ok, data: ok ? body : null };
            } catch {
                return { ok: false, data: null };
            }
        })();
        setView(deriveFeedPreviewView(load));
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!merchant?.id) return;
        void loadData();
    }, [merchant?.id, loadData]);

    // Chargement (profil marchand OU aperçu) — annoncé aux lecteurs d'écran.
    if (merchantLoading || (merchant?.id && loading)) {
        return (
            <>
                <PageHeader title="Aperçu Google" storeName={merchant?.name} />
                <div className="mt-8 text-center text-sm text-tertiary" role="status" aria-live="polite">
                    Chargement de l'aperçu…
                </div>
            </>
        );
    }

    // Profil marchand introuvable / en erreur → état honnête avec porte de sortie (pas de spinner infini).
    if (merchantError || !merchant?.id) {
        return (
            <>
                <PageHeader title="Aperçu Google" storeName={merchant?.name} />
                <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-secondary bg-primary p-8 text-center" role="alert">
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
            <PageHeader title="Aperçu Google" storeName={merchant?.name} />

            <div className="mx-auto mt-6 max-w-2xl space-y-4">
                {/* Bandeau « lecture seule » : lever d'emblée la crainte « ça va publier tout de suite ». */}
                <div className="rounded-2xl border border-secondary bg-secondary_subtle p-4">
                    <p className="text-sm font-semibold text-primary">Aperçu avant publication</p>
                    <p className="mt-1 text-xs text-tertiary">
                        Voici exactement ce qui apparaîtrait sur Google Shopping et Google Maps. Rien n'est envoyé
                        depuis cet écran — c'est une simulation sur votre catalogue réel.
                    </p>
                </div>

                {view?.kind === "error" && (
                    <div className="rounded-2xl border border-secondary bg-primary p-6 text-center" role="alert">
                        <p className="text-sm font-semibold text-primary">Impossible de charger l'aperçu</p>
                        <p className="mt-1 text-xs text-tertiary">Une erreur est survenue. Vos produits ne sont pas affectés.</p>
                        <button
                            type="button"
                            onClick={loadData}
                            className="mt-4 rounded-xl border border-secondary px-4 py-2.5 min-h-[44px] text-sm font-medium text-secondary transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            Réessayer
                        </button>
                    </div>
                )}

                {view?.kind === "empty" && (
                    <div className="rounded-2xl border border-secondary bg-primary p-8 text-center">
                        <h2 className="text-lg font-semibold text-primary">Aucun produit à prévisualiser</h2>
                        <p className="mt-2 text-sm text-tertiary">
                            Importez votre stock : vos produits apparaîtront ici, avec le détail de ce qui serait
                            publié sur Google.
                        </p>
                        <Link
                            href="/dashboard/stock"
                            className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-solid px-6 py-3 min-h-[44px] text-sm font-medium text-white transition hover:bg-brand-solid_hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            Importer mon stock
                        </Link>
                    </div>
                )}

                {view?.kind === "preview" && (
                    <>
                        {/* En-tête chiffré : combien partiraient sur Google, sur combien de candidats. */}
                        <div className="rounded-2xl border border-secondary bg-primary p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-tertiary">Publiables sur Google</p>
                                    <p className="mt-0.5 text-xs text-tertiary">
                                        {view.summary.publishable} / {view.summary.total} produits candidats
                                    </p>
                                </div>
                                <p
                                    className={`text-3xl font-bold ${
                                        view.summary.score >= 70
                                            ? "text-success-primary"
                                            : view.summary.score >= 40
                                              ? "text-warning-primary"
                                              : "text-error-primary"
                                    }`}
                                >
                                    {view.summary.score}%
                                </p>
                            </div>
                            <div
                                className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"
                                role="progressbar"
                                aria-valuenow={view.summary.score}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`Part de produits publiables sur Google : ${view.summary.score} %`}
                            >
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        view.summary.score >= 70
                                            ? "bg-success-solid"
                                            : view.summary.score >= 40
                                              ? "bg-warning-solid"
                                              : "bg-error-solid"
                                    }`}
                                    style={{ width: `${view.summary.score}%` }}
                                />
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-secondary px-3 py-1 text-xs text-tertiary">
                                    Boutique&nbsp;: {view.storeCode}
                                </span>
                                <span
                                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                                        view.googleConnected
                                            ? "bg-success-secondary text-success-primary"
                                            : "bg-secondary text-tertiary"
                                    }`}
                                >
                                    {view.googleConnected ? "Connecté à Google" : "Pas encore connecté à Google"}
                                </span>
                                {view.gtinOnlyTier && (
                                    <span className="rounded-full bg-secondary px-3 py-1 text-xs text-tertiary">
                                        Mode code-barres (Google enrichit les photos)
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Ce qui SERAIT publié — le feed réel, produit par produit. */}
                        {view.wouldPublish.length > 0 && (
                            <section className="rounded-2xl border border-secondary bg-primary p-6" aria-labelledby="would-publish-heading">
                                <div className="mb-4 flex items-center gap-2">
                                    <h2 id="would-publish-heading" className="text-sm font-semibold text-primary">
                                        Publié sur Google
                                    </h2>
                                    <span className="rounded-full bg-success-secondary px-2.5 py-0.5 text-xs font-semibold text-success-primary">
                                        {view.wouldPublish.length}
                                    </span>
                                </div>
                                <ul className="space-y-3">
                                    {view.wouldPublish.map((item) => (
                                        <PreviewItemRow key={item.offerId} item={item} />
                                    ))}
                                </ul>
                            </section>
                        )}

                        {/* Ce qui NE partirait PAS + pourquoi → action directe du marchand. */}
                        {view.blocked.length > 0 && (
                            <section className="rounded-2xl border border-secondary bg-primary p-6" aria-labelledby="blocked-heading">
                                <div className="mb-1 flex items-center gap-2">
                                    <h2 id="blocked-heading" className="text-sm font-semibold text-primary">
                                        Non publié
                                    </h2>
                                    <span className="rounded-full bg-warning-secondary px-2.5 py-0.5 text-xs font-semibold text-warning-primary">
                                        {view.blocked.length}
                                    </span>
                                </div>
                                <p className="mb-4 text-xs text-tertiary">
                                    Ces produits ne partiraient pas sur Google. Corrigez la cause indiquée pour les rendre publiables.
                                </p>
                                <ul className="space-y-2">
                                    {view.blocked.map((p) => (
                                        <li key={p.id} className="rounded-xl bg-secondary px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-sm font-medium text-primary">{p.name}</p>
                                                {p.ean && (
                                                    <span className="shrink-0 font-mono text-xs text-tertiary">{p.ean}</span>
                                                )}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {p.reasons.map((r) => (
                                                    <span
                                                        key={r}
                                                        className="rounded-full bg-warning-secondary px-2.5 py-0.5 text-xs font-medium text-warning-primary"
                                                    >
                                                        {feedBlockReasonLabel(r)}
                                                    </span>
                                                ))}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {/* Retour vers la page Google (connexion / score). */}
                        <div className="pt-1 text-center">
                            <Link
                                href="/dashboard/google"
                                className="text-xs font-medium text-secondary transition hover:text-primary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded"
                            >
                                ← Retour à Google
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

/** Une ligne « publié » : photo (ou pastille code-barres), titre, marque, prix (+ promo), dispo. */
function PreviewItemRow({ item }: { item: FeedPreviewItem }) {
    return (
        <li className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-3">
            {item.imageLink ? (
                // eslint-disable-next-line @next/next/no-img-element -- image produit distante (Supabase/Serper), pas d'optimisation Next requise pour un aperçu
                <img
                    src={item.imageLink}
                    alt={item.title}
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
            ) : (
                <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-tertiary text-tertiary"
                    aria-hidden="true"
                    title="Publié via code-barres (Google fournit la photo)"
                >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" d="M4 6v12M8 6v12M12 6v12M16 6v12M20 6v12" />
                    </svg>
                </div>
            )}
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">{item.title}</p>
                <p className="truncate text-xs text-tertiary">
                    {item.brand ? `${item.brand} · ` : ""}
                    <span className="font-mono">{item.gtin}</span>
                </p>
            </div>
            <div className="shrink-0 text-right">
                {item.salePrice ? (
                    <>
                        <p className="text-sm font-semibold text-success-primary">
                            {item.salePrice.value} {item.salePrice.currency}
                        </p>
                        <p className="text-xs text-tertiary line-through">
                            {item.price.value} {item.price.currency}
                        </p>
                    </>
                ) : (
                    <p className="text-sm font-semibold text-primary">
                        {item.price.value} {item.price.currency}
                    </p>
                )}
                <p
                    className={`mt-0.5 text-xs ${
                        item.availability === "in stock" ? "text-success-primary" : "text-tertiary"
                    }`}
                >
                    {item.availability === "in stock" ? "En stock" : "Épuisé"}
                </p>
            </div>
        </li>
    );
}

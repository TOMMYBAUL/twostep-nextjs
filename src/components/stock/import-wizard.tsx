"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle, XClose } from "@untitledui/icons";
import { cx } from "@/utils/cx";

/**
 * Wizard d'import catalogue — étape « voici ce que j'ai compris, confirmez ».
 *
 * Affiche le résultat du mode preview de /api/catalog/import (simulation sans
 * écriture) : lignes publiables (code-barres reconnu), lignes à compléter
 * (code interne), lignes rejetées (et POURQUOI), produits qui passeraient à 0.
 * Rien ne s'applique tant que le marchand n'a pas confirmé.
 */

export type TriageDto = {
    gtin_lines: number;
    sku_lines: number;
    rejected_lines: number;
    rejected_samples: { name: string | null; code: string | null; reason: string }[];
};

export type ImportPreviewDto = {
    already_imported?: boolean;
    products_created: number;
    products_updated: number;
    stock_zeroed: number;
    reconcile_skipped: boolean;
    total_items: number;
    triage: TriageDto;
};

const REASON_LABELS: Record<string, string> = {
    no_identifier: "ni code-barres ni référence",
    invalid_identifier: "code inexploitable",
};

function Row({ count, label, tone, hint }: { count: number; label: string; tone: "success" | "warning" | "error" | "neutral"; hint?: string }) {
    const tones = {
        success: "text-success-primary",
        warning: "text-warning-primary",
        error: "text-error-primary",
        neutral: "text-tertiary",
    } as const;
    return (
        <div className="flex items-baseline justify-between border-b border-secondary py-2.5 last:border-0">
            <div>
                <p className="text-[13px] font-medium text-primary">{label}</p>
                {hint && <p className="text-[11px] text-tertiary">{hint}</p>}
            </div>
            <span className={cx("text-[15px] font-semibold tabular-nums", tones[tone])}>{count}</span>
        </div>
    );
}

export function ImportWizard({
    open,
    fileName,
    preview,
    applying,
    onConfirm,
    onClose,
}: {
    open: boolean;
    fileName: string;
    preview: ImportPreviewDto | null;
    applying: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) {
    if (!preview) return null;

    const exploitable = preview.triage.gtin_lines + preview.triage.sku_lines;
    const nothingUsable = exploitable === 0;

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60"
                        onClick={applying ? undefined : onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        className="fixed inset-x-4 top-1/2 z-50 mx-auto max-h-[85dvh] max-w-lg -translate-y-1/2 overflow-y-auto rounded-2xl bg-primary p-5 shadow-xl"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Confirmer l'import du catalogue"
                    >
                        <div className="mb-1 flex items-center justify-between">
                            <h2 className="text-[15px] font-semibold text-primary">Vérifiez avant d'appliquer</h2>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={applying}
                                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                                aria-label="Fermer"
                            >
                                <XClose className="size-4 text-tertiary" aria-hidden="true" />
                            </button>
                        </div>
                        <p className="mb-3 truncate text-[12px] text-tertiary">
                            {fileName} &middot; {preview.total_items} lignes lues — rien n'est encore appliqué
                        </p>

                        {preview.already_imported && (
                            <div className="mb-3 flex items-start gap-2 rounded-xl bg-warning-secondary px-3.5 py-2.5">
                                <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning-primary" aria-hidden="true" />
                                <p className="text-[12px] font-medium text-warning-primary">
                                    Ce fichier exact a déjà été importé — le ré-appliquer sera refusé.
                                </p>
                            </div>
                        )}

                        <Row
                            count={preview.triage.gtin_lines}
                            label="Produits à code-barres reconnu"
                            hint="Identifiés automatiquement, publiables après vérification"
                            tone="success"
                        />
                        <Row
                            count={preview.triage.sku_lines}
                            label="Produits à code interne"
                            hint="Stock suivi — complétez leur fiche pour les publier"
                            tone="warning"
                        />
                        <Row
                            count={preview.triage.rejected_lines}
                            label="Lignes ignorées"
                            hint="Sans code-barres ni référence (le nom seul ne suffit pas)"
                            tone={preview.triage.rejected_lines > 0 ? "error" : "neutral"}
                        />
                        <Row count={preview.products_created} label="Nouveaux produits" tone="neutral" />
                        <Row count={preview.products_updated} label="Produits mis à jour" tone="neutral" />
                        <Row
                            count={preview.stock_zeroed}
                            label="Produits passés en épuisé"
                            hint="Présents avant, absents de ce fichier"
                            tone={preview.stock_zeroed > 0 ? "warning" : "neutral"}
                        />

                        {preview.reconcile_skipped && (
                            <div className="mt-3 flex items-start gap-2 rounded-xl bg-warning-secondary px-3.5 py-2.5">
                                <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning-primary" aria-hidden="true" />
                                <p className="text-[12px] font-medium text-warning-primary">
                                    Fichier partiel détecté : les produits absents ne seront PAS passés en épuisé (sécurité).
                                </p>
                            </div>
                        )}

                        {preview.triage.rejected_samples.length > 0 && (
                            <details className="mt-3">
                                <summary className="cursor-pointer text-[12px] font-medium text-tertiary">
                                    Voir les lignes ignorées ({preview.triage.rejected_lines})
                                </summary>
                                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                                    {preview.triage.rejected_samples.map((r, i) => (
                                        <li key={i} className="rounded-md bg-secondary px-2.5 py-1.5 text-[11px] text-tertiary">
                                            <span className="font-medium text-secondary">{r.name ?? r.code ?? "(ligne sans libellé)"}</span>
                                            {" — "}{REASON_LABELS[r.reason] ?? r.reason}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}

                        {nothingUsable ? (
                            <div className="mt-4 flex items-start gap-2 rounded-xl bg-error-secondary px-3.5 py-2.5">
                                <AlertCircle className="mt-0.5 size-4 shrink-0 text-error-primary" aria-hidden="true" />
                                <p className="text-[12px] font-medium text-error-primary">
                                    Aucune ligne exploitable : chaque produit doit avoir un code-barres ou une
                                    référence. Vérifiez les colonnes de votre export.
                                </p>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={onConfirm}
                                disabled={applying || preview.already_imported}
                                className={cx(
                                    "mt-4 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] py-[13px] text-[13px] font-semibold transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                                    applying || preview.already_imported
                                        ? "bg-secondary text-tertiary"
                                        : "bg-brand-solid text-white active:opacity-80",
                                )}
                            >
                                <CheckCircle className="size-4" aria-hidden="true" />
                                {applying ? "Application en cours..." : "Confirmer et appliquer"}
                            </button>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

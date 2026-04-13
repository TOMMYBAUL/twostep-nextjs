"use client";

import { useState } from "react";

type Provider = "gmail" | "outlook" | "yahoo" | "other";

const PROVIDERS: { id: Provider; name: string; subtitle: string; icon: string }[] = [
    { id: "gmail", name: "Gmail", subtitle: "3 étapes — 30 secondes", icon: "G" },
    { id: "outlook", name: "Outlook / Hotmail", subtitle: "3 étapes — 30 secondes", icon: "O" },
    { id: "yahoo", name: "Yahoo", subtitle: "3 étapes — 30 secondes", icon: "Y!" },
    { id: "other", name: "Autre (Orange, Free, SFR...)", subtitle: "Guide général", icon: "✉" },
];

const STEPS: Record<Provider, { step: string; detail: string }[]> = {
    gmail: [
        { step: "Ouvrez les paramètres Gmail", detail: "Cliquez sur ⚙️ en haut à droite → \"Voir tous les paramètres\"" },
        { step: "Onglet \"Transfert et POP/IMAP\"", detail: "Cliquez sur \"Ajouter une adresse de transfert\" et collez votre adresse Two-Step" },
        { step: "Confirmez", detail: "Gmail enverra un email de vérification — cliquez le lien, puis activez \"Transférer une copie\"" },
    ],
    outlook: [
        { step: "Ouvrez les paramètres", detail: "Cliquez sur ⚙️ → \"Afficher tous les paramètres d'Outlook\"" },
        { step: "Courrier → Transfert", detail: "Activez le transfert et collez votre adresse Two-Step" },
        { step: "Enregistrez", detail: "Cochez \"Conserver une copie des messages transférés\" et enregistrez" },
    ],
    yahoo: [
        { step: "Ouvrez les paramètres", detail: "Cliquez sur ⚙️ → \"Autres paramètres de messagerie\"" },
        { step: "Boîtes aux lettres → Transfert", detail: "Collez votre adresse Two-Step et vérifiez" },
        { step: "Confirmez", detail: "Yahoo enverra un code de vérification — entrez-le pour activer" },
    ],
    other: [
        { step: "Ouvrez les paramètres de votre boîte mail", detail: "Cherchez \"Transfert\", \"Redirection\" ou \"Forwarding\"" },
        { step: "Ajoutez l'adresse Two-Step", detail: "Collez votre adresse factures-...@twostep.fr" },
        { step: "Activez et confirmez", detail: "Certains fournisseurs demandent une vérification par email" },
    ],
};

export function EmailSetupGuide({ address, onClose }: { address: string; onClose: () => void }) {
    const [selected, setSelected] = useState<Provider | null>(null);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Guide de configuration email">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-overlay" onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} />

            {/* Sheet */}
            <div className="relative w-full max-w-lg rounded-t-2xl bg-primary p-6 shadow-xl sm:rounded-2xl" style={{ overscrollBehavior: "contain" }}>
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-primary">
                        {selected ? PROVIDERS.find((p) => p.id === selected)!.name : "Activez le transfert en 30 secondes"}
                    </h2>
                    <button
                        onClick={selected ? () => setSelected(null) : onClose}
                        className="flex size-8 items-center justify-center rounded-lg text-tertiary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        aria-label={selected ? "Retour" : "Fermer"}
                    >
                        {selected ? "←" : "✕"}
                    </button>
                </div>

                {!selected ? (
                    <div className="space-y-2.5">
                        {PROVIDERS.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setSelected(p.id)}
                                className="flex w-full items-center gap-3 rounded-xl border border-secondary p-4 text-left transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                            >
                                <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-secondary">
                                    {p.icon}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-primary">{p.name}</p>
                                    <p className="text-xs text-tertiary">{p.subtitle}</p>
                                </div>
                                <svg className="size-4 text-quaternary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path d="M9 18l6-6-6-6" />
                                </svg>
                            </button>
                        ))}

                        <div className="mt-4 rounded-xl bg-secondary p-3.5">
                            <p className="text-xs leading-relaxed text-tertiary">
                                <strong className="text-secondary">Besoin d'aide ?</strong> Lors de notre prochaine visite, nous pouvons l'activer ensemble en 30 secondes sur votre téléphone.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="mb-4 rounded-lg bg-secondary px-3.5 py-2.5">
                            <p className="text-[11px] text-tertiary">Votre adresse à coller :</p>
                            <p className="mt-0.5 font-mono text-xs font-medium text-primary">{address}</p>
                        </div>

                        <div className="space-y-4">
                            {STEPS[selected].map((s, i) => (
                                <div key={i} className="flex gap-3">
                                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-secondary text-xs font-bold text-brand-secondary">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-primary">{s.step}</p>
                                        <p className="mt-0.5 text-xs leading-relaxed text-tertiary">{s.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={onClose}
                            className="mt-6 w-full min-h-[44px] rounded-xl bg-brand-solid py-3 text-sm font-semibold text-white transition hover:bg-brand-solid_hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                        >
                            C'est fait !
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

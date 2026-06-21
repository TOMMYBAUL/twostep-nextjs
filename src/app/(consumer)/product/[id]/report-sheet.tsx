"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { XClose } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { useFocusTrap } from "../../hooks/use-focus-trap";

/**
 * Sheet « signaler une erreur » — le filet de confiance final : un client sur
 * place constate que la donnée est fausse, on enregistre, et assez de
 * signalements récents dégradent l'état affiché (lib/stock/reports.ts).
 */

const REASONS = [
    { value: "not_in_store", label: "Pas en stock sur place", hint: "Le produit n'était pas en rayon" },
    { value: "wrong_price", label: "Prix incorrect", hint: "Le prix en boutique est différent" },
    { value: "other", label: "Autre problème", hint: "Photo, description, taille..." },
] as const;

type ReasonValue = (typeof REASONS)[number]["value"];

const SPRING_SHEET = { type: "spring" as const, damping: 28, stiffness: 300 };

export function ReportSheet({
    open,
    onClose,
    productId,
}: {
    open: boolean;
    onClose: () => void;
    productId: string;
}) {
    const prefersReducedMotion = useReducedMotion();
    const sheetRef = useFocusTrap(open);
    const [selected, setSelected] = useState<ReasonValue | null>(null);
    const [status, setStatus] = useState<"idle" | "sending" | "sent" | "auth" | "error">("idle");

    const springOrInstant = prefersReducedMotion ? { duration: 0 } : SPRING_SHEET;

    const submit = async () => {
        if (!selected || status === "sending") return;
        setStatus("sending");
        try {
            const res = await fetch(`/api/products/${productId}/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: selected }),
            });
            if (res.status === 401) { setStatus("auth"); return; }
            if (!res.ok) { setStatus("error"); return; }
            setStatus("sent");
        } catch {
            setStatus("error");
        }
    };

    const close = () => {
        onClose();
        // Reset après l'animation de sortie pour ne pas voir l'état clignoter.
        setTimeout(() => { setSelected(null); setStatus("idle"); }, 300);
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60"
                        role="button"
                        tabIndex={-1}
                        aria-label="Fermer"
                        onClick={close}
                    />
                    <motion.div
                        ref={sheetRef}
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={springOrInstant}
                        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-primary"
                        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Signaler une erreur"
                    >
                        <div className="px-5 pb-3 pt-3">
                            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-tertiary" />
                            <div className="flex items-center justify-between">
                                <h2 className="text-[15px] font-semibold text-primary">Signaler une erreur</h2>
                                <button
                                    type="button"
                                    onClick={close}
                                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                    aria-label="Fermer"
                                >
                                    <XClose className="size-4 text-tertiary" aria-hidden="true" />
                                </button>
                            </div>
                        </div>

                        {status === "sent" ? (
                            <div className="px-5 pb-4 pt-2">
                                <p className="text-[13px] font-medium text-success-primary">
                                    Merci, signalement envoyé.
                                </p>
                                <p className="mt-1 text-[12px] text-tertiary">
                                    On en tient compte immédiatement dans l'état affiché de ce produit.
                                </p>
                            </div>
                        ) : (
                            <div className="px-5 pb-2">
                                <p className="mb-3 text-[12px] text-tertiary">
                                    Vous êtes sur place et quelque chose ne correspond pas ? Dites-le nous —
                                    votre signalement corrige ce que voient les autres clients.
                                </p>
                                <div className="space-y-2" role="radiogroup" aria-label="Motif du signalement">
                                    {REASONS.map((r) => {
                                        const isSelected = selected === r.value;
                                        return (
                                            <button
                                                key={r.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={isSelected}
                                                onClick={() => setSelected(r.value)}
                                                className={cx(
                                                    "flex w-full flex-col items-start rounded-xl border px-4 py-3 text-left transition duration-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                                                    isSelected
                                                        ? "border-brand border-[1.5px] bg-brand-secondary"
                                                        : "border-secondary bg-primary",
                                                )}
                                            >
                                                <span className={cx("text-[13px] font-medium", isSelected ? "text-brand-secondary" : "text-primary")}>
                                                    {r.label}
                                                </span>
                                                <span className="text-[11px] text-tertiary">{r.hint}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {status === "auth" && (
                                    <p className="mt-3 text-[12px] font-medium text-warning-primary" role="alert">
                                        Connectez-vous pour signaler (ça nous évite les faux signalements).
                                    </p>
                                )}
                                {status === "error" && (
                                    <p className="mt-3 text-[12px] font-medium text-error-primary" role="alert">
                                        Échec de l'envoi — réessayez dans quelques instants.
                                    </p>
                                )}

                                <button
                                    type="button"
                                    onClick={submit}
                                    disabled={!selected || status === "sending"}
                                    className={cx(
                                        "mt-4 flex w-full min-h-[44px] items-center justify-center rounded-[14px] py-[13px] text-[13px] font-semibold transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                                        !selected || status === "sending"
                                            ? "bg-secondary text-tertiary"
                                            : "bg-brand-solid text-white active:opacity-80",
                                    )}
                                >
                                    {status === "sending" ? "Envoi..." : "Envoyer le signalement"}
                                </button>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

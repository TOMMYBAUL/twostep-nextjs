"use client";

import { useCallback, useEffect, useState } from "react";
import { XClose, Keyboard01 } from "@untitledui/icons";

import { playScanFeedback } from "@/lib/barcode-audio";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";

export type ScanStatus = "merchant_hit" | "global_hit" | "miss";

export interface ScanResult {
    status: ScanStatus;
    ean: string;
    product?: Record<string, unknown>;
}

interface BarcodeScanModalProps {
    open: boolean;
    merchantId: string;
    onClose: () => void;
    onResult: (result: ScanResult) => void;
}

export function BarcodeScanModal({ open, merchantId, onClose, onResult }: BarcodeScanModalProps) {
    const [lastFeedback, setLastFeedback] = useState<{ ean: string; status: ScanStatus } | null>(null);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const [manualEan, setManualEan] = useState("");
    const [busy, setBusy] = useState(false);

    const resolveEan = useCallback(async (ean: string) => {
        setBusy(true);
        try {
            const res = await fetch(`/api/products/by-ean?ean=${encodeURIComponent(ean)}&merchant_id=${encodeURIComponent(merchantId)}`);
            if (!res.ok) throw new Error("lookup_failed");
            const data = (await res.json()) as { status: ScanStatus; product?: Record<string, unknown> };
            setLastFeedback({ ean, status: data.status });
            onResult({ status: data.status, ean, product: data.product });
        } catch {
            setLastFeedback({ ean, status: "miss" });
            onResult({ status: "miss", ean });
        } finally {
            setBusy(false);
            // clear feedback after 1.5s so the camera stays usable for the next scan
            setTimeout(() => setLastFeedback((f) => (f?.ean === ean ? null : f)), 1500);
        }
    }, [merchantId, onResult]);

    const handleDetected = useCallback((ean: string) => {
        if (busy) return;
        playScanFeedback();
        void resolveEan(ean);
    }, [busy, resolveEan]);

    const handleScannerError = useCallback((reason: "permission" | "not_found" | "decoder" | "other") => {
        if (reason === "permission") setPermissionDenied(true);
        if (reason === "not_found" || reason === "decoder") setManualOpen(true);
    }, []);

    const { videoRef } = useBarcodeScanner({
        enabled: open && !manualOpen,
        onDetected: handleDetected,
        onError: handleScannerError,
    });

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // Reset transient state when modal closes
    useEffect(() => {
        if (!open) {
            setLastFeedback(null);
            setManualOpen(false);
            setManualEan("");
            setPermissionDenied(false);
        }
    }, [open]);

    if (!open) return null;

    const handleManualSubmit = () => {
        if (!/^[0-9]{8,14}$/.test(manualEan)) return;
        playScanFeedback();
        void resolveEan(manualEan);
        setManualEan("");
    };

    const feedbackText = lastFeedback
        ? lastFeedback.status === "merchant_hit"
            ? "✅ Produit trouvé dans ton stock"
            : lastFeedback.status === "global_hit"
                ? "✨ Produit reconnu — à ajouter ?"
                : "❓ EAN inconnu"
        : null;

    return (
        <div className="fixed inset-0 z-50 bg-black" role="dialog" aria-modal="true" aria-label="Scanner un code-barres">
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
            />

            {/* Viewfinder overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative size-[220px]">
                    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
                        <path d="M0 20 V0 H20" stroke="white" strokeWidth="3" fill="none" />
                        <path d="M80 0 H100 V20" stroke="white" strokeWidth="3" fill="none" />
                        <path d="M100 80 V100 H80" stroke="white" strokeWidth="3" fill="none" />
                        <path d="M20 100 H0 V80" stroke="white" strokeWidth="3" fill="none" />
                    </svg>
                </div>
            </div>

            {/* Top bar */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                <button
                    type="button"
                    aria-label="Fermer"
                    onClick={onClose}
                    className="flex size-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                >
                    <XClose aria-hidden="true" className="size-5" />
                </button>
                <p className="rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                    Aligne le code dans le cadre
                </p>
            </div>

            {/* Feedback card */}
            {feedbackText && (
                <div className="absolute inset-x-4 top-1/2 mt-36 rounded-xl bg-white/95 p-3 text-center shadow-xl backdrop-blur">
                    <p className="text-sm font-semibold text-primary">{feedbackText}</p>
                    {lastFeedback && (
                        <p className="text-xs text-tertiary">EAN {lastFeedback.ean}</p>
                    )}
                </div>
            )}

            {/* Permission denied state */}
            {permissionDenied && !manualOpen && (
                <div className="absolute inset-x-4 top-1/3 rounded-xl bg-white p-5 text-center shadow-xl">
                    <p className="mb-2 text-lg font-bold text-primary">Caméra bloquée</p>
                    <p className="mb-4 text-sm text-tertiary">
                        Autorise l'accès caméra depuis ton navigateur, ou saisis le code manuellement.
                    </p>
                    <button
                        type="button"
                        onClick={() => setManualOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-brand-solid px-4 py-2.5 text-sm font-semibold text-white"
                    >
                        <Keyboard01 aria-hidden="true" className="size-4" /> Saisir manuellement
                    </button>
                </div>
            )}

            {/* Bottom CTA — manual entry */}
            {!manualOpen && (
                <div className="absolute inset-x-0 bottom-0 p-4 pb-8">
                    <button
                        type="button"
                        onClick={() => setManualOpen(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/90 px-4 py-3 text-sm font-semibold text-primary shadow-lg backdrop-blur focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                    >
                        <Keyboard01 aria-hidden="true" className="size-4" />
                        Saisir le code manuellement
                    </button>
                </div>
            )}

            {/* Manual entry bottom sheet */}
            {manualOpen && (
                <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-5 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.25)]">
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-secondary" aria-hidden="true" />
                    <h3 className="mb-3 text-sm font-bold text-primary">Code-barres manuel</h3>
                    <input
                        autoFocus
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={manualEan}
                        onChange={(e) => setManualEan(e.target.value.replace(/\D/g, "").slice(0, 14))}
                        className="mb-3 w-full rounded-xl border border-secondary bg-white px-4 py-3 text-sm text-primary outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgba(66,104,255,0.1)]"
                        placeholder="Ex : 3701234567890"
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => { setManualOpen(false); setManualEan(""); }}
                            className="flex-1 rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-primary"
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            onClick={handleManualSubmit}
                            disabled={!/^[0-9]{8,14}$/.test(manualEan) || busy}
                            className="flex-1 rounded-xl bg-brand-solid px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            {busy ? "Vérification…" : "Valider"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/components/dashboard/toast";

type InboundStatus = {
    address: string;
    has_received: boolean;
    last_received_at: string | null;
};

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
}

export function EmailInboundBanner({ onShowGuide }: { onShowGuide: () => void }) {
    const { merchant } = useMerchant();
    const { toast } = useToast();
    const [status, setStatus] = useState<InboundStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!merchant) return;
        fetch("/api/email/inbound-address")
            .then((r) => r.json())
            .then((data) => { if (data.address) setStatus(data); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [merchant]);

    const copyAddress = useCallback(() => {
        if (!status?.address) return;
        navigator.clipboard.writeText(status.address);
        toast("Adresse copiée !");
    }, [status, toast]);

    if (loading || !status) return null;

    // État 2 : email actif (au moins 1 facture reçue via email)
    if (status.has_received) {
        return (
            <div className="mb-6 rounded-xl border border-success bg-success-secondary p-4">
                <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-primary/10">
                        <svg className="size-[18px] text-success-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
                        </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-success-primary">Transfert email actif</p>
                        <p className="mt-0.5 text-xs text-success-primary/80">
                            {status.address}
                            {status.last_received_at && ` — Dernière facture ${timeAgo(status.last_received_at)}`}
                        </p>
                    </div>
                    <button
                        onClick={copyAddress}
                        className="min-h-[44px] shrink-0 rounded-lg border border-success px-3 py-1.5 text-xs font-medium text-success-primary transition hover:bg-success-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                    >
                        Copier l'adresse
                    </button>
                </div>
            </div>
        );
    }

    // État 1 : email non configuré
    return (
        <div className="mb-6 rounded-xl border border-brand/20 bg-brand-secondary/30 p-5">
            <div className="flex items-start gap-3.5">
                <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-secondary">
                    <svg className="size-[22px] text-brand-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M22 7l-10 7L2 7" />
                    </svg>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-primary">Recevez vos factures automatiquement</p>
                    <p className="mt-1 text-xs leading-relaxed text-tertiary">
                        Activez le transfert automatique depuis votre boîte mail. Vos factures fournisseurs arriveront ici toutes seules.
                    </p>

                    <div className="mt-3.5 flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-lg border border-secondary bg-primary px-3.5 py-2.5 font-mono text-[13px] text-primary">
                            {status.address}
                        </div>
                        <button
                            onClick={copyAddress}
                            className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-brand-solid px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-brand-solid_hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                        >
                            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                            Copier
                        </button>
                    </div>

                    <button
                        onClick={onShowGuide}
                        className="mt-2.5 min-h-[44px] text-xs font-medium text-brand-secondary transition hover:text-brand-secondary_hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                    >
                        Comment activer le transfert automatique ? →
                    </button>
                </div>
            </div>
        </div>
    );
}

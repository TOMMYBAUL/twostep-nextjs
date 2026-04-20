"use client";

import Link from "next/link";

import { formatRelativeTime, posLabel, usePosSyncStatus } from "@/hooks/use-pos-sync-status";

export function PosSyncWidget() {
    const { status, loading } = usePosSyncStatus();

    if (loading && !status) {
        return <div className="animate-fade-up stagger-2 h-16 animate-pulse rounded-2xl bg-secondary" aria-hidden="true" />;
    }
    if (!status) return null;

    const dotClass = status.state === "ok"
        ? "bg-success-solid shadow-[0_0_12px_rgba(34,197,94,0.6)]"
        : status.state === "problem"
            ? "bg-error-solid shadow-[0_0_16px_rgba(239,68,68,0.7)]"
            : "bg-warning-solid shadow-[0_0_10px_rgba(234,179,8,0.5)]";

    const meta = status.state === "ok"
        ? `Dernière sync ${formatRelativeTime(status.last_sync_at)} · ${status.products_synced_count ?? 0} produits`
        : status.state === "problem"
            ? `Dernière sync ${formatRelativeTime(status.last_sync_at)} · reconnexion requise`
            : "Connecter pour auto-sync · voir les avantages";

    const metaClass = status.state === "problem" ? "text-error-primary" : "text-tertiary";

    const href = status.state === "problem"
        ? "/dashboard/stock/pos?mode=reconnect"
        : status.state === "none"
            ? "/dashboard/stock/pos?mode=discover"
            : "/dashboard/stock/pos";

    return (
        <Link
            href={href}
            role="status"
            aria-label={`${posLabel(status)} — ${meta}`}
            className="animate-fade-up stagger-2 mb-4 flex items-center gap-3 rounded-2xl border border-secondary bg-primary px-4 py-3.5 no-underline transition hover:bg-primary_hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
        >
            <span className={`size-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">{posLabel(status)}</p>
                <p className={`text-xs ${metaClass}`}>{meta}</p>
            </div>
            <span className="text-quaternary" aria-hidden="true">→</span>
        </Link>
    );
}

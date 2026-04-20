"use client";

import { useEffect, useState } from "react";

export type PosSyncState = "ok" | "problem" | "none";
export type PosProblemReason = "token_expired" | "api_error" | "stale_sync" | null;

export interface PosSyncStatus {
    profile: "A" | "B" | "C";
    pos_type: string | null;
    state: PosSyncState;
    last_sync_at: string | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
    products_synced_count: number | null;
    problem_reason: PosProblemReason;
}

const REFETCH_MS = 60_000;

export function usePosSyncStatus() {
    const [status, setStatus] = useState<PosSyncStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const fetchOnce = async () => {
            try {
                const res = await fetch("/api/pos/status");
                if (!res.ok) {
                    if (res.status === 404 && !cancelled) setStatus(null);
                    return;
                }
                const data = (await res.json()) as PosSyncStatus;
                if (!cancelled) setStatus(data);
            } catch {
                // keep previous status on transient error
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        const loop = () => {
            if (document.visibilityState !== "visible") return;
            void fetchOnce();
        };

        void fetchOnce();
        timer = setInterval(loop, REFETCH_MS);
        document.addEventListener("visibilitychange", loop);

        return () => {
            cancelled = true;
            if (timer) clearInterval(timer);
            document.removeEventListener("visibilitychange", loop);
        };
    }, []);

    return { status, loading };
}

export function formatRelativeTime(isoDate: string | null): string {
    if (!isoDate) return "jamais";
    const diff = Date.now() - new Date(isoDate).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
}

export function posLabel(status: PosSyncStatus): string {
    const provider = status.pos_type ? status.pos_type[0].toUpperCase() + status.pos_type.slice(1) : "POS";
    if (status.state === "ok") return `${provider} · Synchronisé`;
    if (status.state === "problem") {
        if (status.problem_reason === "token_expired") return `${provider} · Token expiré`;
        if (status.problem_reason === "api_error") return `${provider} · Erreur de sync`;
        return `${provider} · Sync en retard`;
    }
    return "Aucun POS connecté";
}

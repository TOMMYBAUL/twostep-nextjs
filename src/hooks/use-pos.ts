"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Merchant } from "@/lib/types";

type SyncResult = {
    products_created: number;
    products_updated: number;
    stock_updated: number;
    promos_imported: number;
};

const SUPPORTED_POS = ["square", "lightspeed", "shopify", "sumup", "zettle"] as const;
type POSProvider = (typeof SUPPORTED_POS)[number];

export function usePOS(merchant: Merchant | null, onUpdate: () => void) {
    const [connecting, setConnecting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

    const connectedProvider = merchant?.pos_type as POSProvider | null;
    const isConnected = !!connectedProvider && SUPPORTED_POS.includes(connectedProvider);

    const connect = useCallback(async (provider: POSProvider = "square") => {
        setConnecting(true);
        try {
            const res = await fetch(`/api/pos/${provider}/auth`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Connection failed");
            }
            const { auth_url } = await res.json();
            window.location.href = auth_url;
        } finally {
            setConnecting(false);
        }
    }, []);

    const disconnect = useCallback(async () => {
        setConnecting(true);
        try {
            const res = await fetch("/api/pos/disconnect", { method: "POST" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Disconnection failed");
            }
            setSyncResult(null);
            onUpdate();
        } finally {
            setConnecting(false);
        }
    }, [onUpdate]);

    const sync = useCallback(async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch("/api/pos/sync", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Sync failed");
            setSyncResult(data.synced);
            onUpdate();
            return data.synced as SyncResult;
        } finally {
            setSyncing(false);
        }
    }, [onUpdate]);

    // Silent sync (no toast, no setSyncResult)
    const silentSync = useCallback(async () => {
        try {
            const res = await fetch("/api/pos/sync", { method: "POST" });
            if (res.ok) onUpdate();
        } catch {
            // silent — no error surfaced
        }
    }, [onUpdate]);

    // Auto-sync every 15 min + initial sync if stale
    const hasMountedRef = useRef(false);
    useEffect(() => {
        if (!isConnected) return;

        // Initial sync on mount if pos_last_sync is null or > 15 min ago
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            const lastSync = merchant?.pos_last_sync;
            const fifteenMin = 15 * 60 * 1000;
            if (!lastSync || Date.now() - new Date(lastSync).getTime() > fifteenMin) {
                silentSync();
            }
        }

        // Interval: silent sync every 15 min
        const interval = setInterval(silentSync, 15 * 60 * 1000);
        return () => clearInterval(interval);
    }, [isConnected, merchant?.pos_last_sync, silentSync]);

    return { isConnected, connectedProvider, connecting, syncing, syncResult, connect, disconnect, sync };
}

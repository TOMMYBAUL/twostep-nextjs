"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Merchant } from "@/lib/types";

type SyncResult = {
    products_created: number;
    products_updated: number;
    stock_updated: number;
    promos_imported: number;
    pos_items_total?: number;
    visible_count?: number;
};

const SUPPORTED_POS = ["square", "lightspeed", "shopify", "zettle", "clictill", "fastmag"] as const;
type POSProvider = (typeof SUPPORTED_POS)[number];

const DIRECT_AUTH_POS: POSProvider[] = ["clictill", "fastmag"];

export function usePOS(merchant: Merchant | null, onUpdate: () => void) {
    const [connecting, setConnecting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

    const connectedProvider = merchant?.pos_type as POSProvider | null;
    const isConnected = !!connectedProvider && SUPPORTED_POS.includes(connectedProvider);

    const connect = useCallback(async (provider: POSProvider = "square") => {
        if (DIRECT_AUTH_POS.includes(provider)) {
            throw new Error(`${provider} uses direct credentials — use connectDirect()`);
        }
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

    const connectDirect = useCallback(async (provider: POSProvider, credentials: Record<string, unknown>) => {
        setConnecting(true);
        try {
            const res = await fetch(`/api/pos/${provider}/connect-direct`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(credentials),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Connection failed");
            onUpdate();
            return data;
        } finally {
            setConnecting(false);
        }
    }, [onUpdate]);

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

    // Force re-sync: nuke POS products and rebuild from POS catalog
    const resync = useCallback(async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch("/api/pos/resync", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Re-sync failed");
            setSyncResult(data);
            onUpdate();
            return data;
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

    // Auto-sync: 15 min (webhook-backed POS providers)
    const syncIntervalMs = 15 * 60 * 1000;

    const hasMountedRef = useRef(false);
    useEffect(() => {
        if (!isConnected) return;

        // Initial sync on mount if pos_last_sync is stale
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            const lastSync = merchant?.pos_last_sync;
            if (!lastSync || Date.now() - new Date(lastSync).getTime() > syncIntervalMs) {
                silentSync();
            }
        }

        const interval = setInterval(silentSync, syncIntervalMs);
        return () => clearInterval(interval);
    }, [isConnected, merchant?.pos_last_sync, silentSync, syncIntervalMs]);

    return { isConnected, connectedProvider, connecting, syncing, syncResult, connect, connectDirect, disconnect, sync, resync };
}

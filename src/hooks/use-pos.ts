"use client";

import { useCallback, useState } from "react";

import type { Merchant } from "@/lib/types";

type SyncResult = {
    products_created: number;
    products_updated: number;
    stock_updated: number;
};

export function usePOS(merchant: Merchant | null, onUpdate: () => void) {
    const [connecting, setConnecting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

    const isConnected = merchant?.pos_type === "square";

    const connect = useCallback(async () => {
        setConnecting(true);
        try {
            const res = await fetch("/api/pos/connect", { method: "POST" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Connection failed");
            }
            onUpdate();
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

    return { isConnected, connecting, syncing, syncResult, connect, disconnect, sync };
}

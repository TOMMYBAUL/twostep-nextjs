"use client";

import { useCallback, useEffect, useState } from "react";
import type { EmailConnection } from "@/lib/types";

export function useEmail(merchantId: string | null) {
    const [connection, setConnection] = useState<EmailConnection | null>(null);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/email/status");
            const data = await res.json();
            setConnection(data.connection);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (merchantId) fetchStatus();
    }, [merchantId, fetchStatus]);

    const connectGmail = useCallback(async () => {
        const res = await fetch("/api/email/connect?provider=gmail");
        const { auth_url } = await res.json();
        window.location.href = auth_url;
    }, []);

    const connectOutlook = useCallback(async () => {
        const res = await fetch("/api/email/connect?provider=outlook");
        const { auth_url } = await res.json();
        window.location.href = auth_url;
    }, []);

    const connectImap = useCallback(async (credentials: {
        host: string; port: number; user: string; pass: string;
    }) => {
        setConnecting(true);
        try {
            const res = await fetch("/api/email/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: "imap", imap_credentials: credentials }),
            });
            if (res.ok) await fetchStatus();
            return res.ok;
        } finally {
            setConnecting(false);
        }
    }, [fetchStatus]);

    const disconnect = useCallback(async () => {
        await fetch("/api/email/disconnect", { method: "POST" });
        setConnection(null);
    }, []);

    return {
        connection,
        loading,
        connecting,
        isConnected: connection?.status === "active",
        connectGmail,
        connectOutlook,
        connectImap,
        disconnect,
        refetch: fetchStatus,
    };
}

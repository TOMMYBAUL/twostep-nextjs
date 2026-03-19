"use client";

import { useCallback, useEffect, useState } from "react";
import type { Merchant } from "@/lib/types";

export function useMerchant() {
    const [merchant, setMerchant] = useState<Merchant | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMerchant = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await window.fetch("/api/merchants");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMerchant(data.merchant);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load merchant");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchMerchant(); }, [fetchMerchant]);

    return { merchant, loading, error, refetch: fetchMerchant };
}

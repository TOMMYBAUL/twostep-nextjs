"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMerchant } from "./use-merchant";

export type DashboardStats = {
    funnel: {
        views: { current: number; previous: number };
        favorites: { current: number; previous: number };
        follows: { total: number };
    };
    stock: {
        total: number;
        inStock: number;
        lowStock: number;
        outOfStock: number;
        withPhoto: number;
    };
    score: number;
    activePromos: number;
};

export function useDashboardStats() {
    const { merchant } = useMerchant();
    const [data, setData] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchStats = useCallback(async () => {
        if (!merchant?.id) return;
        setError(null);
        try {
            const res = await window.fetch(`/api/merchants/${merchant.id}/stats`);
            if (!res.ok) throw new Error("Failed to fetch stats");
            const json = await res.json();
            setData(json);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch stats");
        } finally {
            setLoading(false);
        }
    }, [merchant?.id]);

    useEffect(() => {
        if (!merchant?.id) return;
        fetchStats();
        intervalRef.current = setInterval(fetchStats, 60_000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [merchant?.id, fetchStats]);

    return { data, loading, error, refetch: fetchStats };
}

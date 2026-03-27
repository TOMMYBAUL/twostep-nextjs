"use client";

import { useEffect, useState } from "react";
import { useMerchant } from "@/hooks/use-merchant";

type Cta = { label: string; href: string };

export type CoachTip = {
    emoji: string;
    text: string;
    category: string;
    cta?: Cta | null;
};

export type CoachTipsData = {
    insight: CoachTip;
    action: CoachTip;
};

export function useCoachTips() {
    const { merchant } = useMerchant();
    const [data, setData] = useState<CoachTipsData | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!merchant?.id) return;

        setLoading(true);
        fetch(`/api/merchants/${merchant.id}/tips`)
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (json?.insight && json?.action) setData(json);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [merchant?.id]);

    return { data, loading };
}

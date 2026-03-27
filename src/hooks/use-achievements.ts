"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMerchant } from "./use-merchant";
import { useDashboardStats, type DashboardStats } from "./use-dashboard-stats";
import { useCelebration } from "@/providers/celebration-provider";
import {
    ACHIEVEMENTS,
    type Achievement,
    type AchievementType,
} from "@/lib/achievements";

function detectNewMilestones(
    stats: DashboardStats,
    onboardingComplete: boolean,
    unlocked: Set<AchievementType>
): AchievementType[] {
    const newOnes: AchievementType[] = [];

    const checks: [AchievementType, boolean][] = [
        ["first-product", stats.stock.total >= 1],
        ["first-view", stats.funnel.views.current >= 1 || stats.funnel.views.previous >= 1],
        ["first-favorite", stats.funnel.favorites.current >= 1 || stats.funnel.favorites.previous >= 1],
        ["first-follower", stats.funnel.follows.total >= 1],
        ["views-100", (stats.funnel.views.current + stats.funnel.views.previous) >= 100],
        ["first-promo", stats.activePromos >= 1],
        ["onboarding-complete", onboardingComplete],
        ["score-50", stats.score >= 50],
        ["score-80", stats.score >= 80],
    ];

    for (const [type, condition] of checks) {
        if (condition && !unlocked.has(type)) {
            newOnes.push(type);
        }
    }

    return newOnes;
}

export function useAchievements(onboardingComplete: boolean) {
    const { merchant } = useMerchant();
    const { data: stats } = useDashboardStats();
    const { enqueue } = useCelebration();
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const hasCheckedRef = useRef(false);

    const fetchAchievements = useCallback(async () => {
        if (!merchant?.id) return;
        try {
            const res = await window.fetch(`/api/merchants/${merchant.id}/achievements`);
            if (!res.ok) return;
            const json = await res.json();
            setAchievements(json.achievements);
        } finally {
            setLoading(false);
        }
    }, [merchant?.id]);

    useEffect(() => {
        fetchAchievements();
    }, [fetchAchievements]);

    useEffect(() => {
        if (!merchant?.id || !stats || loading || hasCheckedRef.current) return;
        hasCheckedRef.current = true;

        const unlocked = new Set(achievements.map((a) => a.type as AchievementType));
        const newMilestones = detectNewMilestones(stats, onboardingComplete, unlocked);

        if (newMilestones.length === 0) return;

        (async () => {
            for (const type of newMilestones) {
                try {
                    const res = await window.fetch(`/api/merchants/${merchant.id}/achievements`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type }),
                    });
                    if (res.status === 201) {
                        const json = await res.json();
                        const def = ACHIEVEMENTS[type];
                        setAchievements((prev) => [json.achievement, ...prev]);
                        enqueue({ ...def, achievementId: json.achievement.id });
                    }
                } catch {
                    // Silently skip failed unlocks
                }
            }
        })();
    }, [merchant?.id, stats, loading, achievements, onboardingComplete, enqueue]);

    return { achievements, loading, refetch: fetchAchievements };
}

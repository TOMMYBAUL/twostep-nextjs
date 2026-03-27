"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { AchievementBadgeCard } from "@/components/dashboard/achievement-badge";
import { ACHIEVEMENTS, ALL_ACHIEVEMENT_TYPES, type AchievementType } from "@/lib/achievements";
import { useAchievements } from "@/hooks/use-achievements";

export default function AchievementsPage() {
    const { achievements, loading } = useAchievements(false);

    const unlockedSet = new Set(achievements.map((a) => a.type));
    const unlockedMap = new Map(achievements.map((a) => [a.type, a.unlocked_at]));

    const sorted = [...ALL_ACHIEVEMENT_TYPES].sort((a, b) => {
        const aUnlocked = unlockedSet.has(a);
        const bUnlocked = unlockedSet.has(b);
        if (aUnlocked && !bUnlocked) return -1;
        if (!aUnlocked && bUnlocked) return 1;
        if (aUnlocked && bUnlocked) {
            return new Date(unlockedMap.get(b)!).getTime() - new Date(unlockedMap.get(a)!).getTime();
        }
        return ACHIEVEMENTS[a].order - ACHIEVEMENTS[b].order;
    });

    return (
        <>
            <PageHeader title="Mes" titleAccent="trophées" />

            <div className="max-w-2xl">
                <p className="mb-6 text-sm text-secondary">
                    {achievements.length} / {ALL_ACHIEVEMENT_TYPES.length} trophées débloqués
                </p>

                {loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="animate-pulse rounded-[20px] bg-white/60 h-20" />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sorted.map((type) => {
                            const def = ACHIEVEMENTS[type];
                            const unlocked = unlockedSet.has(type);
                            return (
                                <AchievementBadgeCard
                                    key={type}
                                    def={def}
                                    unlocked={unlocked}
                                    unlockedAt={unlockedMap.get(type)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}

"use client";

import Link from "next/link";
import { ACHIEVEMENTS, type Achievement, type AchievementType } from "@/lib/achievements";
import { AchievementBadge } from "./achievement-badge";

type Props = {
    achievements: Achievement[];
    loading: boolean;
};

export function AchievementWidget({ achievements, loading }: Props) {
    if (loading) {
        return <div className="animate-pulse rounded-xl bg-white/60 h-20" />;
    }

    const latest = achievements.slice(0, 3);
    const extra = achievements.length - 3;

    return (
        <div className="rounded-xl bg-white px-5 py-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                    Mes trophées
                </h3>
                <Link href="/dashboard/achievements" className="text-xs font-medium text-[#4268FF] hover:underline no-underline">
                    Tout voir
                </Link>
            </div>

            {latest.length === 0 ? (
                <p className="text-xs text-[#8E96B0]">
                    Ajoutez votre premier produit pour débloquer votre premier trophée !
                </p>
            ) : (
                <div className="flex items-center gap-2">
                    {latest.map((a) => {
                        const def = ACHIEVEMENTS[a.type as AchievementType];
                        if (!def) return null;
                        return (
                            <AchievementBadge
                                key={a.id}
                                def={def}
                                unlocked
                                unlockedAt={a.unlocked_at}
                                size="md"
                            />
                        );
                    })}
                    {extra > 0 && (
                        <span className="text-xs text-[#8E96B0] ml-1">+ {extra} autre{extra > 1 ? "s" : ""}</span>
                    )}
                </div>
            )}
        </div>
    );
}

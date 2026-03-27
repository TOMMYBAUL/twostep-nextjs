"use client";

import { useEffect, useState } from "react";
import { ACHIEVEMENTS, type AchievementType } from "@/lib/achievements";
import { AchievementBadge } from "@/components/dashboard/achievement-badge";

type ShopBadge = { type: string; unlocked_at: string };

export function ShopBadges({ shopId }: { shopId: string }) {
    const [badges, setBadges] = useState<ShopBadge[]>([]);

    useEffect(() => {
        window.fetch(`/api/shops/${shopId}/badges`)
            .then((r) => r.json())
            .then((data) => setBadges(data.badges ?? []))
            .catch(() => {});
    }, [shopId]);

    if (badges.length === 0) return null;

    return (
        <div className="flex items-center gap-1.5">
            {badges.map((b) => {
                const def = ACHIEVEMENTS[b.type as AchievementType];
                if (!def) return null;
                return (
                    <AchievementBadge
                        key={b.type}
                        def={def}
                        unlocked
                        unlockedAt={b.unlocked_at}
                        size="sm"
                    />
                );
            })}
        </div>
    );
}

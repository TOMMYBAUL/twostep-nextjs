"use client";

import type { AchievementDef } from "@/lib/achievements";

type BadgeProps = {
    def: AchievementDef;
    unlocked: boolean;
    unlockedAt?: string;
    size?: "sm" | "md" | "lg";
};

const sizes = {
    sm: { circle: 28, emoji: 14, icon: 12 },
    md: { circle: 40, emoji: 20, icon: 16 },
    lg: { circle: 56, emoji: 26, icon: 20 },
};

export function AchievementBadge({ def, unlocked, unlockedAt, size = "md" }: BadgeProps) {
    const s = sizes[size];

    if (!unlocked) {
        return (
            <div
                className="flex items-center justify-center rounded-full bg-gray-100"
                style={{ width: s.circle, height: s.circle }}
                title={`${def.label} — Verrouillé`}
            >
                <span style={{ fontSize: s.icon }} className="text-gray-400">🔒</span>
            </div>
        );
    }

    return (
        <div
            className="flex items-center justify-center rounded-full"
            style={{
                width: s.circle,
                height: s.circle,
                background: def.gradient,
                boxShadow: `0 2px 8px ${def.color}4D`,
            }}
            title={`${def.label} — ${unlockedAt ? new Date(unlockedAt).toLocaleDateString("fr-FR") : ""}`}
        >
            <span style={{ fontSize: s.emoji }}>{def.emoji}</span>
        </div>
    );
}

type BadgeCardProps = {
    def: AchievementDef;
    unlocked: boolean;
    unlockedAt?: string;
};

export function AchievementBadgeCard({ def, unlocked, unlockedAt }: BadgeCardProps) {
    return (
        <div
            className={`flex items-center gap-3.5 rounded-[20px] px-5 py-4 transition ${
                unlocked ? "bg-white" : "bg-gray-50 opacity-60"
            }`}
            style={unlocked ? {
                border: `2px solid ${def.color}`,
                boxShadow: `0 2px 12px ${def.color}25`,
            } : {
                border: "2px solid #e5e7eb",
            }}
        >
            <AchievementBadge def={def} unlocked={unlocked} unlockedAt={unlockedAt} size="lg" />
            <div className="flex-1 min-w-0">
                {unlocked && (
                    <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: def.color }}>
                        {def.gamifiedLabel}
                    </p>
                )}
                <p className={`text-sm font-bold ${unlocked ? "text-[#2C1A0E]" : "text-gray-400"}`}>
                    {def.label}
                </p>
                <p className="text-[11px] text-[#8B7355] mt-0.5">
                    {unlocked
                        ? def.subtitle
                        : `Condition : ${def.subtitle.toLowerCase()}`}
                </p>
                {unlocked && unlockedAt && (
                    <p className="text-[10px] text-[#8B7355]/60 mt-1">
                        {new Date(unlockedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                )}
            </div>
        </div>
    );
}

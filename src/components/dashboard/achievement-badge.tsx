"use client";

import type { AchievementDef, AchievementIcon } from "@/lib/achievements";
import { Gift01, Eye, Heart, Users01, BarChart01, Tag01, Zap, CheckCircle, Star01, Trophy01, Lock01 } from "@untitledui/icons";
import type { FC, SVGProps } from "react";

const ICON_MAP: Record<AchievementIcon, FC<SVGProps<SVGSVGElement>>> = {
    gift: Gift01,
    eye: Eye,
    heart: Heart,
    users: Users01,
    "bar-chart": BarChart01,
    tag: Tag01,
    zap: Zap,
    "check-circle": CheckCircle,
    star: Star01,
    trophy: Trophy01,
};

type BadgeProps = {
    def: AchievementDef;
    unlocked: boolean;
    unlockedAt?: string;
    size?: "sm" | "md" | "lg";
};

const sizes = {
    sm: { circle: 28, icon: 14 },
    md: { circle: 40, icon: 20 },
    lg: { circle: 56, icon: 26 },
};

export function AchievementBadge({ def, unlocked, unlockedAt, size = "md" }: BadgeProps) {
    const s = sizes[size];

    if (!unlocked) {
        return (
            <div
                className="flex items-center justify-center rounded-full bg-secondary"
                style={{ width: s.circle, height: s.circle }}
                title={`${def.label} — Verrouillé`}
            >
                <Lock01 style={{ width: s.icon, height: s.icon }} className="text-quaternary" aria-hidden="true" />
            </div>
        );
    }

    const Icon = ICON_MAP[def.icon];

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
            <Icon style={{ width: s.icon, height: s.icon }} className="text-white" aria-hidden="true" />
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
                unlocked ? "bg-primary" : "bg-secondary opacity-60"
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
                <p className={`text-sm font-bold ${unlocked ? "text-primary" : "text-quaternary"}`}>
                    {def.label}
                </p>
                <p className="text-[11px] text-tertiary mt-0.5">
                    {unlocked
                        ? def.subtitle
                        : `Condition : ${def.subtitle.toLowerCase()}`}
                </p>
                {unlocked && unlockedAt && (
                    <p className="text-[10px] text-tertiary/60 mt-1">
                        {new Date(unlockedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                )}
            </div>
        </div>
    );
}

"use client";

import type { ScoreBreakdown } from "@/hooks/use-dashboard-stats";

type ScoreProps = {
    score: number;
    breakdown?: ScoreBreakdown;
};

const DEFAULT_BREAKDOWN: ScoreBreakdown = { foundation: 0, engagement: 0, activity: 0, reach: 0 };

function getScoreColor(score: number) {
    if (score >= 70) return "#5a9474";
    if (score >= 40) return "#4268FF";
    if (score >= 20) return "#d97706";
    return "#c4553a";
}

function getScoreLabel(score: number) {
    if (score >= 70) return "Visible";
    if (score >= 40) return "En progrès";
    if (score >= 20) return "Peu visible";
    return "Invisible";
}

const CATEGORIES = [
    { key: "engagement" as const, label: "Visibilité", max: 40, icon: "👁" },
    { key: "foundation" as const, label: "Fondation", max: 20, icon: "🏗" },
    { key: "activity" as const, label: "Activité", max: 20, icon: "⚡" },
    { key: "reach" as const, label: "Portée", max: 20, icon: "🌐" },
];

function getWeakestTip(breakdown: ScoreBreakdown): string {
    const tips: Record<string, string> = {
        engagement: "Partagez votre page pour attirer vos premiers visiteurs.",
        foundation: "Complétez votre profil et ajoutez des photos à vos produits.",
        activity: "Mettez votre stock à jour et créez une promo.",
        reach: "Connectez Google Merchant Center pour apparaître sur Google.",
    };
    let weakest = CATEGORIES[0];
    let weakestRatio = 1;
    for (const cat of CATEGORIES) {
        const ratio = breakdown[cat.key] / cat.max;
        if (ratio < weakestRatio) {
            weakestRatio = ratio;
            weakest = cat;
        }
    }
    return tips[weakest.key];
}

export function TwoStepScore({ score, breakdown: rawBreakdown }: ScoreProps) {
    const breakdown = rawBreakdown ?? DEFAULT_BREAKDOWN;
    const color = getScoreColor(score);
    const label = getScoreLabel(score);
    const tip = getWeakestTip(breakdown);

    return (
        <div className="rounded-xl bg-primary px-5 py-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                        Score Two-Step
                    </h3>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
                        <span className="text-sm text-secondary">/100</span>
                        <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ color, background: `${color}15` }}
                        >
                            {label}
                        </span>
                    </div>
                </div>
            </div>

            {/* Main progress bar */}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${score}%`, background: color }}
                />
            </div>

            {/* Category breakdown */}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                {CATEGORIES.map((cat) => {
                    const val = breakdown[cat.key];
                    const pct = Math.round((val / cat.max) * 100);
                    return (
                        <div key={cat.key} className="flex items-center gap-2">
                            <span className="text-xs" aria-hidden="true">{cat.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-medium text-secondary">{cat.label}</span>
                                    <span className="text-[10px] tabular-nums text-tertiary">{val}/{cat.max}</span>
                                </div>
                                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-secondary">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${pct}%`,
                                            background: pct >= 70 ? "#5a9474" : pct >= 40 ? "#4268FF" : "#d97706",
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Tip based on weakest category */}
            {score < 70 && (
                <p className="mt-2.5 text-xs text-tertiary">{tip}</p>
            )}
        </div>
    );
}

"use client";

import Link from "next/link";
import type { CoachTipsData } from "@/hooks/use-coach-tips";

const CATEGORY_LABELS: Record<string, string> = {
    photos: "📸 Photos",
    stock: "📦 Stock",
    promos: "🏷️ Promos",
    profil: "🏪 Profil",
    engagement: "📈 Engagement",
};

function CategoryBadge({ category }: { category: string }) {
    return (
        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: "#F5F6FA", color: "#1A1F36" }}>
            {CATEGORY_LABELS[category] || category}
        </span>
    );
}

function InsightCard({ tip }: { tip: CoachTipsData["insight"] }) {
    return (
        <div className="relative overflow-hidden rounded-xl border border-[#e8e2d4] bg-white px-5 py-5">
            <div className="absolute inset-x-0 top-0 h-[3px]"
                style={{ background: "linear-gradient(90deg, #4268FF, #4268FF)" }} />
            <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{tip.emoji}</span>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#4268FF" }}>
                    Votre situation
                </span>
            </div>
            <p className="text-sm leading-relaxed text-[#1A1F36]">{tip.text}</p>
            <div className="mt-3 flex justify-end">
                <CategoryBadge category={tip.category} />
            </div>
        </div>
    );
}

function ActionCard({ tip }: { tip: CoachTipsData["action"] }) {
    return (
        <div className="relative overflow-hidden rounded-xl border border-[#e8e2d4] bg-white px-5 py-5">
            <div className="absolute inset-x-0 top-0 h-[3px]"
                style={{ background: "linear-gradient(90deg, #4268FF, #4268FF)" }} />
            <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{tip.emoji}</span>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#4268FF" }}>
                    Action du jour
                </span>
            </div>
            <p className="text-sm leading-relaxed text-[#1A1F36]">{tip.text}</p>
            {tip.cta && (
                <Link href={tip.cta.href}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
                    style={{ background: "#4268FF" }}>
                    {tip.cta.label} <span>→</span>
                </Link>
            )}
            <div className="mt-3 flex justify-end">
                <CategoryBadge category={tip.category} />
            </div>
        </div>
    );
}

export function CoachTips({ data, loading }: { data: CoachTipsData | null; loading: boolean }) {
    if (loading) {
        return (
            <div className="space-y-3">
                <div className="animate-pulse rounded-xl bg-white/60 h-28" />
                <div className="animate-pulse rounded-xl bg-white/60 h-32" />
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="space-y-3">
            <InsightCard tip={data.insight} />
            <ActionCard tip={data.action} />
            <div className="flex justify-center pt-1">
                <Link href="/dashboard/tips-history"
                    className="text-[13px] text-[#8E96B0] transition hover:text-[#4268FF]">
                    Voir l'historique des conseils →
                </Link>
            </div>
        </div>
    );
}

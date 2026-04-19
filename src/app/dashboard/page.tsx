"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { DiscoveryFunnel } from "@/components/dashboard/discovery-funnel";
import { TwoStepScore } from "@/components/dashboard/twostep-score";
import { TodayTasks } from "@/components/dashboard/today-tasks";
import { CoachTips } from "@/components/dashboard/coach-tips";
import { AchievementWidget } from "@/components/dashboard/achievement-widget";
import { IntentSignals } from "@/components/dashboard/intent-signals";
import { useCoachTips } from "@/hooks/use-coach-tips";
import { useAchievements } from "@/hooks/use-achievements";
import { useMerchant } from "@/hooks/use-merchant";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { useTodayTasks } from "@/hooks/use-today-tasks";
import { createClient } from "@/lib/supabase/client";
import { generateSlug } from "@/lib/slug";

export default function DashboardPage() {
    const { merchant } = useMerchant();
    const { data: stats, loading: statsLoading } = useDashboardStats();
    const { data: tips, loading: tipsLoading } = useCoachTips();
    const { onboardingComplete } = useTodayTasks();
    const { achievements, loading: achievementsLoading } = useAchievements(onboardingComplete);

    const [suggestions, setSuggestions] = useState<Array<{ id: string; text: string; created_at: string }>>([]);

    useEffect(() => {
        if (!merchant) return;
        (async () => {
            const supabase = createClient();
            const { data } = await supabase
                .from("suggestions")
                .select("id, text, created_at")
                .eq("merchant_id", merchant.id)
                .eq("status", "visible")
                .order("created_at", { ascending: false })
                .limit(3);
            if (data) setSuggestions(data);
        })();
    }, [merchant]);

    const viewsTrend =
        stats && stats.funnel.views.previous > 0
            ? Math.round(((stats.funnel.views.current - stats.funnel.views.previous) / stats.funnel.views.previous) * 100)
            : undefined;

    return (
        <>
            <PageHeader storeName={merchant?.name} title="Bienvenue sur" titleAccent="Two-Step" />

            <IntentSignals merchantId={merchant?.id} />

            <div className="max-w-2xl lg:max-w-4xl space-y-4">
                {statsLoading ? (
                    <div className="animate-pulse rounded-xl bg-primary h-20" />
                ) : stats ? (
                    <TwoStepScore score={stats.score} breakdown={stats.scoreBreakdown} />
                ) : null}

                <TodayTasks />

                {onboardingComplete && (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="lg:col-span-1">
                                {statsLoading ? (
                                    <div className="animate-pulse rounded-xl bg-primary h-24" />
                                ) : stats ? (
                                    <div className="rounded-xl bg-primary px-5 py-6">
                                        <HeroStat value={stats.funnel.views.current} label="vues cette semaine" trend={viewsTrend} />
                                    </div>
                                ) : null}
                            </div>
                            <div className="lg:col-span-2">
                                {statsLoading ? (
                                    <div className="animate-pulse rounded-xl bg-primary h-24" />
                                ) : stats ? (
                                    <DiscoveryFunnel
                                        views={stats.funnel.views}
                                        favorites={stats.funnel.favorites}
                                        follows={stats.funnel.follows}
                                    />
                                ) : null}
                            </div>
                        </div>

                        {suggestions.length > 0 && (
                            <div className="rounded-xl bg-primary px-5 py-4">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                                    Suggestions de vos clients
                                </h3>
                                <div className="mt-3 space-y-2.5">
                                    {suggestions.map((s) => (
                                        <div key={s.id} className="flex gap-3 rounded-lg bg-secondary px-3.5 py-2.5">
                                            <span aria-hidden="true" className="mt-0.5 text-sm">💬</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs text-secondary leading-relaxed">{s.text}</p>
                                                <p className="mt-1 text-[10px] text-tertiary">
                                                    {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            <QuickLink href="/dashboard/stock/mon-stock" label="Mon stock" description="Produits + ruptures" />
                            <QuickLink href="/dashboard/promotions" label="Promos" description="Créer une promotion" />
                            <QuickLink href="/dashboard/store" label="Ma boutique" description="Modifier votre profil" />
                            {merchant && (
                                <ExternalQuickLink
                                    href={`/shop/${merchant.slug ?? generateSlug(merchant.name, merchant.id)}`}
                                    label="Voir ma boutique"
                                    description="Comme un client"
                                />
                            )}
                        </div>
                    </>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <CoachTips data={tips} loading={tipsLoading} />
                    <AchievementWidget achievements={achievements} loading={achievementsLoading} />
                </div>
            </div>
        </>
    );
}

function QuickLink({ href, label, description }: { href: string; label: string; description: string }) {
    return (
        <Link href={href} className="group rounded-xl bg-primary px-5 py-4 no-underline transition hover:shadow-sm focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none">
            <p className="text-sm font-semibold text-primary group-hover:text-brand-secondary transition">{label}</p>
            <p className="mt-0.5 text-xs text-tertiary">{description}</p>
        </Link>
    );
}

function ExternalQuickLink({ href, label, description }: { href: string; label: string; description: string }) {
    return (
        <Link href={href} target="_blank" rel="noopener noreferrer" className="group rounded-xl bg-brand-solid px-5 py-4 no-underline transition hover:shadow-sm focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none">
            <p className="text-sm font-semibold text-white transition">{label}</p>
            <p className="mt-0.5 text-xs text-white/70">{description}</p>
        </Link>
    );
}

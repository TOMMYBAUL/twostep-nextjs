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
import { useCoachTips } from "@/hooks/use-coach-tips";
import { useAchievements } from "@/hooks/use-achievements";
import { useMerchant } from "@/hooks/use-merchant";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { IntentSignals } from "@/components/dashboard/intent-signals";
import { createClient } from "@/lib/supabase/client";
import { generateSlug } from "@/lib/slug";

type Step = {
    label: string;
    description: string;
    href: string;
    cta: string;
    checked: boolean;
};

export default function DashboardPage() {
    const { merchant } = useMerchant();
    const { data: stats, loading: statsLoading } = useDashboardStats();
    const { data: tips, loading: tipsLoading } = useCoachTips();
    const [steps, setSteps] = useState<Step[]>([]);
    const [onboardingLoading, setOnboardingLoading] = useState(true);

    useEffect(() => {
        if (!merchant) return;

        async function check() {
            const supabase = createClient();

            const hasPOS = merchant!.pos_type !== null;
            const hasEmail = !!(merchant!.phone);
            const hasPhoto = !!(merchant!.photo_url);
            const hasProfile = !!(merchant!.description && merchant!.address && merchant!.opening_hours);

            const { data: products } = await supabase
                .from("products")
                .select("id, photo_url")
                .eq("merchant_id", merchant!.id)
                .limit(50);
            const totalProducts = products?.length ?? 0;
            const withPhoto = products?.filter((p: any) => p.photo_url).length ?? 0;
            const hasProductPhotos = totalProducts > 0 && withPhoto >= Math.min(totalProducts, 3);

            setSteps([
                {
                    label: "Compléter votre profil boutique",
                    description: "Bio, adresse et horaires d'ouverture — les infos qui donnent envie de vous rendre visite.",
                    href: "/dashboard/store",
                    cta: "Compléter mon profil",
                    checked: hasProfile,
                },
                {
                    label: "Ajouter une photo de boutique",
                    description: "Votre vitrine ou votre intérieur — c'est la première chose que les clients voient.",
                    href: "/dashboard/store",
                    cta: "Ajouter ma photo",
                    checked: hasPhoto,
                },
                {
                    label: "Ajouter votre téléphone de contact",
                    description: "Pour que vos clients puissent vous joindre facilement.",
                    href: "/dashboard/store",
                    cta: "Ajouter mon téléphone",
                    checked: hasEmail,
                },
                {
                    label: "Connecter votre caisse (POS)",
                    description: "Square, Lightspeed ou Shopify — votre stock et vos produits se synchronisent automatiquement.",
                    href: "/dashboard/settings",
                    cta: "Connecter ma caisse",
                    checked: hasPOS,
                },
                {
                    label: "Vérifier vos produits (photos, noms, stock)",
                    description: "Les produits avec photo attirent 3× plus de clics. Complétez ce que le POS ne fournit pas.",
                    href: "/dashboard/products",
                    cta: "Vérifier mes produits",
                    checked: hasProductPhotos,
                },
            ]);

            // Bonus step — only appears when all 5 main steps are complete
            const allMainDone = hasProfile && hasPhoto && hasEmail && hasPOS && hasProductPhotos;
            if (allMainDone) {
                const { data: googleConn } = await supabase
                    .from("google_merchant_connections")
                    .select("id")
                    .eq("merchant_id", merchant!.id)
                    .maybeSingle();

                setSteps((prev) => [
                    ...prev,
                    {
                        label: "🎁 Bonus : Connecter Google Merchant Center",
                        description: "Vos produits apparaissent directement sur Google Shopping — visibilité maximale.",
                        href: "/dashboard/google",
                        cta: "Connecter Google",
                        checked: !!googleConn,
                    },
                ]);
            }

            setOnboardingLoading(false);
        }

        check();
    }, [merchant]);

    const completed = steps.filter((s) => s.checked).length;
    const allDone = steps.length > 0 && completed === steps.length;
    const { achievements, loading: achievementsLoading } = useAchievements(allDone);

    const [suggestions, setSuggestions] = useState<Array<{ id: string; text: string; created_at: string }>>([]);

    useEffect(() => {
        if (!merchant) return;
        async function loadSuggestions() {
            const supabase = createClient();
            const { data } = await supabase
                .from("suggestions")
                .select("id, text, created_at")
                .eq("merchant_id", merchant!.id)
                .eq("status", "visible")
                .order("created_at", { ascending: false })
                .limit(3);
            if (data) setSuggestions(data);
        }
        loadSuggestions();
    }, [merchant]);

    const viewsTrend =
        stats && stats.funnel.views.previous > 0
            ? Math.round(((stats.funnel.views.current - stats.funnel.views.previous) / stats.funnel.views.previous) * 100)
            : undefined;

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Bienvenue sur"
                titleAccent="Two-Step"
            />

            <IntentSignals merchantId={merchant?.id} />

            {onboardingLoading ? (
                <div className="max-w-2xl space-y-6">
                    <div className="animate-pulse rounded-xl bg-white/60 h-20" />
                    <div className="animate-pulse rounded-xl bg-white/60 h-32" />
                </div>
            ) : !allDone ? (
                /* Mode A — Onboarding incomplete */
                <div className="max-w-2xl lg:max-w-4xl space-y-4">
                    {/* Score */}
                    {statsLoading ? (
                        <div className="animate-pulse rounded-xl bg-white/60 h-20" />
                    ) : stats ? (
                        <TwoStepScore score={stats.score} />
                    ) : null}

                    {/* Onboarding checklist — collapsible */}
                    <OnboardingBar steps={steps} completed={completed} />

                    {/* Achievement widget */}
                    <AchievementWidget achievements={achievements} loading={achievementsLoading} />

                    {/* Coach tips */}
                    <CoachTips data={tips} loading={tipsLoading} />
                </div>
            ) : (
                /* Mode B — Onboarding complete */
                <div className="max-w-2xl lg:max-w-4xl space-y-4">
                    {/* Row 1: Hero stat + Funnel */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="lg:col-span-1">
                            {statsLoading ? (
                                <div className="animate-pulse rounded-xl bg-white/60 h-24" />
                            ) : stats ? (
                                <div className="rounded-xl bg-white px-5 py-6">
                                    <HeroStat
                                        value={stats.funnel.views.current}
                                        label="vues cette semaine"
                                        trend={viewsTrend}
                                    />
                                </div>
                            ) : null}
                        </div>
                        <div className="lg:col-span-2">
                            {statsLoading ? (
                                <div className="animate-pulse rounded-xl bg-white/60 h-24" />
                            ) : stats ? (
                                <DiscoveryFunnel
                                    views={stats.funnel.views}
                                    favorites={stats.funnel.favorites}
                                    follows={stats.funnel.follows}
                                />
                            ) : null}
                        </div>
                    </div>

                    {/* Row 2: Score + Tasks */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {statsLoading ? (
                            <div className="animate-pulse rounded-xl bg-white/60 h-20" />
                        ) : stats ? (
                            <TwoStepScore score={stats.score} />
                        ) : null}
                        {statsLoading ? (
                            <div className="animate-pulse rounded-xl bg-white/60 h-24" />
                        ) : stats ? (
                            <TodayTasks stats={stats} />
                        ) : null}
                    </div>

                    {/* Row 3: Tips + Trophées */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <CoachTips data={tips} loading={tipsLoading} />
                        <AchievementWidget achievements={achievements} loading={achievementsLoading} />
                    </div>

                    {/* Suggestions widget */}
                    {suggestions.length > 0 && (
                        <div className="rounded-xl bg-white px-5 py-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">
                                Suggestions de vos clients
                            </h3>
                            <div className="mt-3 space-y-2.5">
                                {suggestions.map((s) => (
                                    <div key={s.id} className="flex gap-3 rounded-lg bg-gray-50 px-3.5 py-2.5">
                                        <span className="mt-0.5 text-sm">💬</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs text-gray-700 leading-relaxed">{s.text}</p>
                                            <p className="mt-1 text-[10px] text-gray-400">
                                                {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Quick links */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        <QuickLink href="/dashboard/products" label="Produits" description="Gérer votre catalogue" />
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
                </div>
            )}
        </>
    );
}

function OnboardingBar({ steps, completed }: { steps: Step[]; completed: number }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="rounded-xl bg-white overflow-hidden">
            {/* Compact bar — always visible */}
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center gap-3 px-5 py-3.5 transition hover:bg-gray-50"
            >
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[#1A1F36]">
                            Configuration boutique
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                            {completed}/{steps.length}
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${steps.length > 0 ? (completed / steps.length) * 100 : 0}%`,
                                background: completed === steps.length ? "#5a9474" : "#4268FF",
                            }}
                        />
                    </div>
                </div>
                <svg
                    className={`size-4 shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {/* Expandable steps */}
            {expanded && (
                <div className="border-t border-gray-100 px-5 py-3 space-y-2">
                    {steps.map((step, i) => (
                        <div
                            key={step.label}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                                step.checked ? "opacity-50" : ""
                            }`}
                        >
                            <div className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                                step.checked
                                    ? "bg-[#4268FF]/10 text-[#4268FF]"
                                    : "bg-gray-100 text-gray-500"
                            }`}>
                                {step.checked ? (
                                    <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M2 6l3 3 5-5" />
                                    </svg>
                                ) : (
                                    i + 1
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-medium ${step.checked ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                    {step.label}
                                </p>
                            </div>
                            {!step.checked && (
                                <Link href={step.href} className="shrink-0 text-[10px] font-semibold text-[#4268FF] no-underline hover:underline">
                                    {step.cta}
                                </Link>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function QuickLink({ href, label, description }: { href: string; label: string; description: string }) {
    return (
        <Link href={href} className="group rounded-xl bg-white px-5 py-4 no-underline transition hover:shadow-sm">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-[#4268FF] transition">{label}</p>
            <p className="mt-0.5 text-xs text-gray-400">{description}</p>
        </Link>
    );
}

function ExternalQuickLink({ href, label, description }: { href: string; label: string; description: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl px-5 py-4 no-underline transition hover:shadow-sm"
            style={{ background: "#4268FF" }}
        >
            <p className="text-sm font-semibold text-white transition">{label}</p>
            <p className="mt-0.5 text-xs text-white/70">{description}</p>
        </a>
    );
}

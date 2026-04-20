"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTodayTasks, type Task } from "@/hooks/use-today-tasks";
import { DailyNudge } from "@/components/dashboard/daily-nudge";
import { pickDailyNudge, type NudgeContext } from "@/lib/daily-nudges";
import { useMerchant } from "@/hooks/use-merchant";

const priorityDotClass: Record<string, string> = {
    high: "bg-error-solid",
    medium: "bg-brand-solid",
    low: "bg-success-solid",
};

export function TodayTasks() {
    const { tasks, loading, onboardingComplete, opsCount } = useTodayTasks();
    const { merchant } = useMerchant();

    const onboardingTasks = tasks.filter((t) => t.category === "onboarding");
    const opsTasks = tasks.filter((t) => t.category === "ops");

    const nudge = useMemo(() => {
        if (!onboardingComplete || opsCount > 0 || !merchant) return null;
        const ctx: NudgeContext = {
            merchant,
            lastPhotoUploadAt: null,
            lastPromoCreatedAt: null,
            lastCloseOfDayAt: null,
            totalProducts: 0,
        };
        return pickDailyNudge(ctx);
    }, [onboardingComplete, opsCount, merchant]);

    if (loading) {
        return <div className="animate-pulse rounded-xl bg-primary h-32" />;
    }

    return (
        <div className="space-y-4">
            {!onboardingComplete && <OnboardingSection tasks={onboardingTasks} />}
            {opsTasks.length > 0 && <OpsSection tasks={opsTasks} />}
            {nudge && <DailyNudge nudge={nudge} />}
            {onboardingComplete && opsCount === 0 && !nudge && (
                <div className="rounded-xl bg-success-secondary px-5 py-4">
                    <p className="text-sm font-semibold text-success-primary">Tout est en ordre !</p>
                    <p className="mt-0.5 text-xs text-success-primary/80">Votre boutique est bien configurée.</p>
                </div>
            )}
        </div>
    );
}

function OnboardingSection({ tasks }: { tasks: Task[] }) {
    const completed = tasks.filter((t) => t.checked).length;
    const total = tasks.length;

    return (
        <div className="rounded-xl bg-primary overflow-hidden">
            <div className="px-5 py-3.5 border-b border-secondary">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                        Configuration boutique
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-tertiary">
                        {completed}/{total}
                    </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                        className="h-full rounded-full bg-brand-solid transition-all duration-500"
                        style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
                    />
                </div>
            </div>
            <div className="px-5 py-3 space-y-2">
                {tasks.map((task, i) => (
                    <div
                        key={task.id}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${task.checked ? "opacity-50" : ""}`}
                    >
                        <div className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                            task.checked ? "bg-brand-secondary text-brand-secondary" : "bg-secondary text-tertiary"
                        }`}>
                            {task.checked ? (
                                <svg aria-hidden="true" className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 6l3 3 5-5" />
                                </svg>
                            ) : (
                                i + 1
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium ${task.checked ? "text-tertiary line-through" : "text-primary"}`}>
                                {task.label}
                            </p>
                            {!task.checked && task.description && (
                                <p className="text-[10px] text-tertiary">{task.description}</p>
                            )}
                        </div>
                        {!task.checked && task.cta && (
                            <Link
                                href={task.href}
                                className="shrink-0 text-[10px] font-semibold text-brand-secondary no-underline hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded"
                            >
                                {task.cta}
                            </Link>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function OpsSection({ tasks }: { tasks: Task[] }) {
    return (
        <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-tertiary">
                {"Aujourd'hui"}
            </h3>
            <div className="space-y-2">
                {tasks.map((task) => (
                    <Link
                        key={task.id}
                        href={task.href}
                        className="flex items-center gap-3 rounded-xl bg-primary px-4 py-3 transition hover:shadow-sm no-underline group focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                        <span className={`size-2 shrink-0 rounded-full ${priorityDotClass[task.priority]}`} aria-hidden="true" />
                        <span className="flex-1">
                            <span className="block text-sm text-primary group-hover:text-brand-secondary transition">
                                {task.label}
                            </span>
                            {task.description && (
                                <span className="block text-[10px] text-tertiary mt-0.5">{task.description}</span>
                            )}
                        </span>
                        <span className="text-xs text-tertiary">→</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}

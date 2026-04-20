"use client";

import Link from "next/link";
import type { Nudge } from "@/lib/daily-nudges";

export function DailyNudge({ nudge }: { nudge: Nudge }) {
    return (
        <div className="rounded-xl bg-brand-primary_alt px-5 py-4">
            <div className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 text-base">✨</span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm text-primary leading-relaxed">{nudge.message}</p>
                    <Link
                        href={nudge.href}
                        className="mt-2 inline-block text-xs font-semibold text-brand-secondary no-underline hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded"
                    >
                        {nudge.cta} →
                    </Link>
                </div>
            </div>
        </div>
    );
}

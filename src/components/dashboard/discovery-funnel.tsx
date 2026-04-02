"use client";

import { Eye, Heart, Users01, ChevronRight } from "@untitledui/icons";
import type { FC, SVGProps } from "react";

type FunnelProps = {
    views: { current: number; previous: number };
    favorites: { current: number; previous: number };
    follows: { total: number };
};

function FunnelStep({ value, label, trend, Icon }: { value: number; label: string; trend?: number; Icon: FC<SVGProps<SVGSVGElement>> }) {
    const trendPositive = trend !== undefined && trend >= 0;
    return (
        <div className="flex-1 rounded-xl bg-primary px-4 py-3 text-center">
            <div className="flex justify-center"><Icon className="size-4 text-tertiary" aria-hidden="true" /></div>
            <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
            <p className="text-xs text-secondary">{label}</p>
            {trend !== undefined && trend !== 0 && (
                <p className={`mt-0.5 text-[10px] font-medium ${trendPositive ? "text-success-primary" : "text-error-primary"}`}>
                    {trendPositive ? "↑" : "↓"} {Math.abs(trend)}%
                </p>
            )}
        </div>
    );
}

function computeTrend(current: number, previous: number): number | undefined {
    if (previous === 0 && current === 0) return undefined;
    if (previous === 0) return 100;
    return Math.round(((current - previous) / previous) * 100);
}

export function DiscoveryFunnel({ views, favorites, follows }: FunnelProps) {
    return (
        <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-tertiary">
                Votre vitrine cette semaine
            </h3>
            <div className="flex gap-2">
                <FunnelStep Icon={Eye} value={views.current} label="Vues" trend={computeTrend(views.current, views.previous)} />
                <div className="flex items-center"><ChevronRight className="size-3 text-tertiary" aria-hidden="true" /></div>
                <FunnelStep Icon={Heart} value={favorites.current} label="Favoris" trend={computeTrend(favorites.current, favorites.previous)} />
                <div className="flex items-center"><ChevronRight className="size-3 text-tertiary" aria-hidden="true" /></div>
                <FunnelStep Icon={Users01} value={follows.total} label="Abonnés" />
            </div>
        </div>
    );
}

"use client";

type FunnelProps = {
    views: { current: number; previous: number };
    favorites: { current: number; previous: number };
    follows: { total: number };
};

function FunnelStep({ value, label, trend, icon }: { value: number; label: string; trend?: number; icon: string }) {
    const trendPositive = trend !== undefined && trend >= 0;
    return (
        <div className="flex-1 rounded-xl bg-white px-4 py-3 text-center">
            <p className="text-xs text-tertiary">{icon}</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: "var(--ts-dark)" }}>{value}</p>
            <p className="text-xs text-secondary">{label}</p>
            {trend !== undefined && trend !== 0 && (
                <p className={`mt-0.5 text-[10px] font-medium ${trendPositive ? "text-[#5a9474]" : "text-[#c4553a]"}`}>
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
                <FunnelStep icon="👀" value={views.current} label="Vues" trend={computeTrend(views.current, views.previous)} />
                <div className="flex items-center text-tertiary">→</div>
                <FunnelStep icon="♡" value={favorites.current} label="Favoris" trend={computeTrend(favorites.current, favorites.previous)} />
                <div className="flex items-center text-tertiary">→</div>
                <FunnelStep icon="🏪" value={follows.total} label="Abonnés" />
            </div>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts";

interface RecentMerchant {
    id: string;
    name: string;
    city: string;
    status: string;
    created_at: string;
}

interface TimelineEntry {
    month: string;
    total: number;
    active: number;
    pending: number;
}

interface AdminStats {
    total_merchants: number;
    merchants_active: number;
    merchants_pending: number;
    merchants_suspended: number;
    total_consumers: number;
    total_products: number;
    total_promotions_active: number;
    recent_merchants: RecentMerchant[];
    timeline: TimelineEntry[];
}

const STATUS_COLORS = {
    active: "#22c55e",
    pending: "#eab308",
    suspended: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
    active: "Actif",
    pending: "En attente",
    suspended: "Suspendu",
};

function MetricCard({
    label,
    value,
    sub,
    accent,
}: {
    label: string;
    value: number;
    sub?: string;
    accent?: string;
}) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p
                className="mt-2 text-4xl font-extrabold tracking-tight"
                style={{ color: accent ?? "#111827" }}
            >
                {value.toLocaleString("fr-FR")}
            </p>
            {sub && <p className="mt-1.5 text-xs text-gray-400">{sub}</p>}
        </div>
    );
}

function formatMonth(month: string) {
    const [y, m] = month.split("-");
    const months = [
        "Jan", "Fev", "Mar", "Avr", "Mai", "Jun",
        "Jul", "Aou", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

export default function AdminOverviewPage() {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/admin/stats")
            .then((res) => {
                if (!res.ok) throw new Error(`Erreur ${res.status}`);
                return res.json();
            })
            .then((data) => setStats(data))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
                <p className="text-sm font-medium text-red-700">
                    Erreur : {error}
                </p>
            </div>
        );
    }

    if (!stats) return null;

    // Pie chart data
    const pieData = [
        { name: "Actifs", value: stats.merchants_active, color: STATUS_COLORS.active },
        { name: "En attente", value: stats.merchants_pending, color: STATUS_COLORS.pending },
        { name: "Suspendus", value: stats.merchants_suspended, color: STATUS_COLORS.suspended },
    ].filter((d) => d.value > 0);

    // Timeline chart data with formatted labels
    const timelineData = stats.timeline.map((t) => ({
        ...t,
        label: formatMonth(t.month),
    }));

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Vue d&apos;ensemble</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Tableau de bord Two-Step — mise a jour en temps reel
                </p>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                    label="Marchands"
                    value={stats.total_merchants}
                    sub={`${stats.merchants_active} actifs · ${stats.merchants_pending} en attente · ${stats.merchants_suspended} suspendus`}
                    accent="#4f46e5"
                />
                <MetricCard
                    label="Consumers"
                    value={stats.total_consumers}
                    accent="#0ea5e9"
                />
                <MetricCard
                    label="Produits"
                    value={stats.total_products}
                    accent="#1A1F36"
                />
                <MetricCard
                    label="Promos actives"
                    value={stats.total_promotions_active}
                    accent="#4268FF"
                />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Area chart — inscriptions timeline */}
                <div className="col-span-1 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
                    <h2 className="mb-4 text-sm font-semibold text-gray-700">
                        Inscriptions marchands par mois
                    </h2>
                    {timelineData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={timelineData}>
                                <defs>
                                    <linearGradient id="gradActive" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gradPending" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 12, fill: "#9ca3af" }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 12, fill: "#9ca3af" }}
                                    axisLine={false}
                                    tickLine={false}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: 12,
                                        border: "1px solid #e5e7eb",
                                        fontSize: 13,
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="active"
                                    name="Actifs"
                                    stroke="#4f46e5"
                                    strokeWidth={2}
                                    fill="url(#gradActive)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="pending"
                                    name="En attente"
                                    stroke="#eab308"
                                    strokeWidth={2}
                                    fill="url(#gradPending)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
                            Pas encore de donnees
                        </div>
                    )}
                </div>

                {/* Pie chart — répartition statuts */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-sm font-semibold text-gray-700">
                        Repartition marchands
                    </h2>
                    {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="45%"
                                    innerRadius={55}
                                    outerRadius={90}
                                    paddingAngle={4}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {pieData.map((entry) => (
                                        <Cell key={entry.name} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Legend
                                    verticalAlign="bottom"
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: 12, color: "#6b7280" }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: 12,
                                        border: "1px solid #e5e7eb",
                                        fontSize: 13,
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
                            Aucun marchand
                        </div>
                    )}
                </div>
            </div>

            {/* Recent merchants */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-6 py-4">
                    <h2 className="text-sm font-semibold text-gray-700">
                        Derniers marchands inscrits
                    </h2>
                </div>
                <div className="divide-y divide-gray-50">
                    {stats.recent_merchants.length === 0 ? (
                        <div className="px-6 py-10 text-center text-sm text-gray-400">
                            Aucun marchand pour le moment
                        </div>
                    ) : (
                        stats.recent_merchants.map((m) => (
                            <div
                                key={m.id}
                                className="flex items-center justify-between px-6 py-3.5"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                                        style={{
                                            background:
                                                STATUS_COLORS[
                                                    m.status as keyof typeof STATUS_COLORS
                                                ] ?? "#9ca3af",
                                        }}
                                    >
                                        {(m.name ?? "?").charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">
                                            {m.name}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {m.city ?? "Ville inconnue"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span
                                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                                        style={{
                                            background:
                                                m.status === "active"
                                                    ? "#f0fdf4"
                                                    : m.status === "pending"
                                                      ? "#fefce8"
                                                      : "#fef2f2",
                                            color:
                                                STATUS_COLORS[
                                                    m.status as keyof typeof STATUS_COLORS
                                                ] ?? "#6b7280",
                                        }}
                                    >
                                        <span
                                            className="h-1.5 w-1.5 rounded-full"
                                            style={{
                                                background:
                                                    STATUS_COLORS[
                                                        m.status as keyof typeof STATUS_COLORS
                                                    ] ?? "#9ca3af",
                                            }}
                                        />
                                        {STATUS_LABELS[m.status] ?? m.status}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {new Date(m.created_at).toLocaleDateString("fr-FR")}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

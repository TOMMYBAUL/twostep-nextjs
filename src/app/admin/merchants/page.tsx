"use client";

import { useCallback, useEffect, useState } from "react";

interface Merchant {
    id: string;
    name: string;
    city: string;
    status: "active" | "pending" | "suspended";
    pos_type: string | null;
    phone: string | null;
    created_at: string;
}

interface MerchantsResponse {
    merchants: Merchant[];
    total: number;
    page: number;
    limit: number;
}

const STATUS_CONFIG = {
    active: { label: "Actif", bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
    pending: { label: "En attente", bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-500" },
    suspended: { label: "Suspendu", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
} as const;

function StatusBadge({ status }: { status: Merchant["status"] }) {
    const config = STATUS_CONFIG[status];
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
        >
            <span className={`size-1.5 rounded-full ${config.dot}`} />
            {config.label}
        </span>
    );
}

type StatusFilter = "all" | "active" | "pending" | "suspended";

export default function AdminMerchantsPage() {
    const [merchants, setMerchants] = useState<Merchant[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const limit = 20;

    const fetchMerchants = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
            });
            if (search.trim()) params.set("search", search.trim());
            if (statusFilter !== "all") params.set("status", statusFilter);

            const res = await fetch(`/api/admin/merchants?${params}`);
            if (!res.ok) throw new Error(`Erreur ${res.status}`);

            const data: MerchantsResponse = await res.json();
            setMerchants(data.merchants);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur inconnue");
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter]);

    useEffect(() => {
        fetchMerchants();
    }, [fetchMerchants]);

    async function updateStatus(merchantId: string, newStatus: "active" | "suspended") {
        setUpdatingId(merchantId);
        try {
            const res = await fetch(`/api/admin/merchants/${merchantId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error(`Erreur ${res.status}`);
            await fetchMerchants();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur inconnue");
        } finally {
            setUpdatingId(null);
        }
    }

    function handleSearchSubmit(e: React.FormEvent) {
        e.preventDefault();
        setPage(1);
    }

    const totalPages = Math.ceil(total / limit);

    const filterButtons: { key: StatusFilter; label: string }[] = [
        { key: "all", label: "Tous" },
        { key: "active", label: "Actifs" },
        { key: "pending", label: "En attente" },
        { key: "suspended", label: "Suspendus" },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Marchands</h1>
                <p className="mt-1 text-sm text-gray-500">
                    {total} marchand{total > 1 ? "s" : ""} enregistre{total > 1 ? "s" : ""}
                </p>
            </div>

            {/* Filters bar */}
            <div className="flex flex-wrap items-center gap-4">
                {/* Search */}
                <form onSubmit={handleSearchSubmit} className="flex-1">
                    <input
                        type="search"
                        placeholder="Rechercher par nom ou ville..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        className="w-full max-w-sm rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                </form>

                {/* Status filter pills */}
                <div className="flex gap-1.5 rounded-xl bg-gray-100 p-1">
                    {filterButtons.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => {
                                setStatusFilter(f.key);
                                setPage(1);
                            }}
                            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                                statusFilter === f.key
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            {/* Table */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/50">
                            <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Marchand
                            </th>
                            <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Ville
                            </th>
                            <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Statut
                            </th>
                            <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                POS
                            </th>
                            <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Telephone
                            </th>
                            <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Inscrit le
                            </th>
                            <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-16 text-center">
                                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                                </td>
                            </tr>
                        ) : merchants.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-16 text-center text-sm text-gray-400">
                                    Aucun marchand trouve
                                </td>
                            </tr>
                        ) : (
                            merchants.map((m) => (
                                <tr key={m.id} className="transition-colors hover:bg-gray-50/60">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                                style={{ background: "#4f46e5" }}
                                            >
                                                {(m.name ?? "?").charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-medium text-gray-900">
                                                {m.name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {m.city || "\u2014"}
                                    </td>
                                    <td className="px-6 py-4">
                                        <StatusBadge status={m.status} />
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {m.pos_type || "\u2014"}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {m.phone || "\u2014"}
                                    </td>
                                    <td className="px-6 py-4 text-gray-500">
                                        {new Date(m.created_at).toLocaleDateString("fr-FR")}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            {m.status !== "active" && (
                                                <button
                                                    onClick={() => updateStatus(m.id, "active")}
                                                    disabled={updatingId === m.id}
                                                    className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
                                                >
                                                    Activer
                                                </button>
                                            )}
                                            {m.status !== "suspended" && (
                                                <button
                                                    onClick={() => updateStatus(m.id, "suspended")}
                                                    disabled={updatingId === m.id}
                                                    className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                                                >
                                                    Suspendre
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        Page {page} sur {totalPages} \u2014 {total} marchand{total > 1 ? "s" : ""}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Precedent
                        </button>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Suivant
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

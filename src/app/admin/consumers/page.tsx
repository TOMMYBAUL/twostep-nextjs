"use client";

import { useCallback, useEffect, useState } from "react";

interface Consumer {
    id: string;
    user_id: string;
    default_lat: number | null;
    default_lng: number | null;
    default_radius_km: number | null;
    created_at: string;
}

interface ConsumersResponse {
    consumers: Consumer[];
    total: number;
    page: number;
    limit: number;
}

export default function AdminConsumersPage() {
    const [consumers, setConsumers] = useState<Consumer[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const limit = 20;

    const fetchConsumers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
            });
            const res = await fetch(`/api/admin/consumers?${params}`);
            if (!res.ok) throw new Error(`Erreur ${res.status}`);

            const data: ConsumersResponse = await res.json();
            setConsumers(data.consumers);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur inconnue");
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        fetchConsumers();
    }, [fetchConsumers]);

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Consumers</h1>
                <p className="mt-1 text-sm text-gray-500">
                    {total} utilisateur{total > 1 ? "s" : ""} enregistre{total > 1 ? "s" : ""}
                </p>
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
                                User ID
                            </th>
                            <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Localisation
                            </th>
                            <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Rayon
                            </th>
                            <th className="px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Inscrit le
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-16 text-center">
                                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                                </td>
                            </tr>
                        ) : consumers.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-16 text-center text-sm text-gray-400">
                                    Aucun consumer pour le moment
                                </td>
                            </tr>
                        ) : (
                            consumers.map((c) => (
                                <tr key={c.id} className="transition-colors hover:bg-gray-50/60">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-600">
                                                U
                                            </div>
                                            <span className="font-mono text-xs text-gray-700">
                                                {c.user_id.slice(0, 12)}...
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {c.default_lat != null && c.default_lng != null
                                            ? `${c.default_lat.toFixed(4)}, ${c.default_lng.toFixed(4)}`
                                            : "\u2014"}
                                    </td>
                                    <td className="px-6 py-4">
                                        {c.default_radius_km != null ? (
                                            <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                                                {c.default_radius_km} km
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">\u2014</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-gray-500">
                                        {new Date(c.created_at).toLocaleDateString("fr-FR")}
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
                        Page {page} sur {totalPages} \u2014 {total} consumer{total > 1 ? "s" : ""}
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

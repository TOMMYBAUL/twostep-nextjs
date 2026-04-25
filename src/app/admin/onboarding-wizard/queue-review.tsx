"use client";

import { useCallback, useEffect, useState } from "react";

interface StagingRow {
    id: number;
    raw_row: Record<string, unknown>;
    status: string;
    created_at: string;
    enriched_product_id: string | null;
    notes: string | null;
}

interface QueueReviewProps {
    merchantId: string;
}

const STATUSES = ["pending", "enriched", "rejected", "duplicate"] as const;

export function QueueReview({ merchantId }: QueueReviewProps) {
    const [rows, setRows] = useState<StagingRow[]>([]);
    const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const load = useCallback(async () => {
        if (!merchantId) {
            setRows([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/onboarding/queue?merchantId=${encodeURIComponent(merchantId)}&status=${status}`,
            );
            const json = (await res.json()) as { rows?: StagingRow[]; error?: string };
            if (!res.ok) {
                setError(json.error ?? `HTTP ${res.status}`);
                setRows([]);
            } else {
                setRows(json.rows ?? []);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "unknown_error");
        } finally {
            setIsLoading(false);
        }
    }, [merchantId, status]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!merchantId) {
        return (
            <p className="text-tertiary">
                Saisis un merchant_id en haut de la page pour voir la queue.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <label htmlFor="queue-status" className="text-sm text-secondary">
                    Filtre status :
                </label>
                <select
                    id="queue-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
                    className="px-2 py-1 border border-secondary rounded text-sm"
                >
                    {STATUSES.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={isLoading}
                    className="px-3 py-1 text-sm border border-secondary rounded hover:bg-secondary_hover"
                >
                    {isLoading ? "Chargement…" : "Recharger"}
                </button>
                <span className="text-tertiary text-sm">{rows.length} ligne(s)</span>
            </div>

            {error && <p className="text-error-primary text-sm">⚠️ {error}</p>}

            {rows.length === 0 && !isLoading && !error && (
                <p className="text-tertiary text-sm">Aucune ligne en {status}.</p>
            )}

            {rows.length > 0 && (
                <div className="overflow-x-auto border border-secondary rounded">
                    <table className="w-full text-sm">
                        <thead className="bg-secondary">
                            <tr>
                                <th className="text-left px-3 py-2 w-16">ID</th>
                                <th className="text-left px-3 py-2">Champs CSV (raw_row)</th>
                                <th className="text-left px-3 py-2 w-32">Statut</th>
                                <th className="text-left px-3 py-2 w-40">Créé</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr
                                    key={r.id}
                                    className="border-t border-secondary align-top"
                                >
                                    <td className="px-3 py-2 font-mono">{r.id}</td>
                                    <td className="px-3 py-2">
                                        <pre className="text-xs whitespace-pre-wrap max-w-xl">
                                            {JSON.stringify(r.raw_row, null, 2)}
                                        </pre>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className="text-xs px-2 py-0.5 rounded bg-tertiary">
                                            {r.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-tertiary">
                                        {new Date(r.created_at).toLocaleString("fr-FR")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

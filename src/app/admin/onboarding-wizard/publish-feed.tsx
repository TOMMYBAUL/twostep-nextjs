"use client";

import { useCallback, useEffect, useState } from "react";

interface PublishFeedProps {
    merchantId: string;
}

interface SampleProduct {
    id: string;
    name: string;
    ean: string | null;
    brand: string | null;
    price: number | string | null; // Supabase NUMERIC peut revenir en string
    channel: string;
}

interface DryRunResponse {
    dryRun: true;
    count: number;
    sample: SampleProduct[];
}

interface PublishResponse {
    published: number;
}

export function PublishFeed({ merchantId }: PublishFeedProps) {
    const [preview, setPreview] = useState<DryRunResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [lastPublishedCount, setLastPublishedCount] = useState<number | null>(null);

    const loadPreview = useCallback(async () => {
        if (!merchantId) {
            setPreview(null);
            return;
        }
        setIsLoading(true);
        setError(null);
        setLastPublishedCount(null);
        try {
            const res = await fetch("/api/admin/onboarding/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ merchantId, dryRun: true }),
            });
            const json = (await res.json()) as
                | DryRunResponse
                | { error: string };
            if (!res.ok || !("count" in json)) {
                setError(("error" in json ? json.error : null) ?? `HTTP ${res.status}`);
                setPreview(null);
            } else {
                setPreview(json);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "unknown_error");
        } finally {
            setIsLoading(false);
        }
    }, [merchantId]);

    useEffect(() => {
        void loadPreview();
    }, [loadPreview]);

    async function handlePublish(): Promise<void> {
        if (!preview || preview.count === 0) return;
        if (
            !confirm(
                `Publier ${preview.count} produit(s) en visible=true ?\nCette action est irréversible (mais réversible via admin DB).`,
            )
        ) {
            return;
        }
        setIsPublishing(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/onboarding/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ merchantId, dryRun: false }),
            });
            const json = (await res.json()) as PublishResponse | { error: string };
            if (!res.ok || !("published" in json)) {
                setError(("error" in json ? json.error : null) ?? `HTTP ${res.status}`);
                return;
            }
            setLastPublishedCount(json.published);
            await loadPreview(); // count devrait passer à 0
        } catch (err) {
            setError(err instanceof Error ? err.message : "unknown_error");
        } finally {
            setIsPublishing(false);
        }
    }

    if (!merchantId) {
        return (
            <p className="text-tertiary">
                Saisis un merchant_id en haut de la page pour preview la publication.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-primary">
                    Publication feed marchand
                </h3>
                <button
                    type="button"
                    onClick={() => void loadPreview()}
                    disabled={isLoading}
                    className="px-3 py-1 text-sm border border-secondary rounded hover:bg-secondary_hover"
                >
                    {isLoading ? "Chargement…" : "Recharger"}
                </button>
            </div>

            {error && <p className="text-error-primary text-sm">⚠️ {error}</p>}

            {lastPublishedCount !== null && (
                <p className="text-success-primary text-sm">
                    ✅ {lastPublishedCount} produit(s) publié(s) avec visible=true,
                    review_status=validated.
                </p>
            )}

            {preview && (
                <div className="space-y-3">
                    <p className="text-sm">
                        <strong>{preview.count}</strong> produit(s) en{" "}
                        <code className="bg-secondary px-1 rounded">
                            review_status=pending_review
                        </code>{" "}
                        prêt(s) à être publié(s).
                    </p>

                    {preview.sample.length > 0 && (
                        <div className="border border-secondary rounded overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary">
                                    <tr>
                                        <th className="text-left px-3 py-2">Nom</th>
                                        <th className="text-left px-3 py-2 w-32">EAN</th>
                                        <th className="text-left px-3 py-2 w-32">Marque</th>
                                        <th className="text-left px-3 py-2 w-24">Prix</th>
                                        <th className="text-left px-3 py-2 w-24">Channel</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.sample.map((p) => (
                                        <tr
                                            key={p.id}
                                            className="border-t border-secondary"
                                        >
                                            <td className="px-3 py-2">{p.name}</td>
                                            <td className="px-3 py-2 font-mono text-xs">
                                                {p.ean ?? "—"}
                                            </td>
                                            <td className="px-3 py-2">{p.brand ?? "—"}</td>
                                            <td className="px-3 py-2">
                                                {p.price !== null
                                                    ? `${Number(p.price).toFixed(2)} €`
                                                    : "—"}
                                            </td>
                                            <td className="px-3 py-2 text-xs">
                                                {p.channel}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {preview.count > preview.sample.length && (
                                <p className="text-tertiary text-xs px-3 py-2 border-t border-secondary">
                                    + {preview.count - preview.sample.length} produit(s)
                                    non affiché(s) dans cet aperçu.
                                </p>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => void handlePublish()}
                        disabled={preview.count === 0 || isPublishing}
                        className="bg-brand-solid text-white px-4 py-2 rounded font-medium hover:bg-brand-solid_hover disabled:opacity-50"
                    >
                        {isPublishing
                            ? "Publication en cours…"
                            : `Publier ${preview.count} produit(s)`}
                    </button>
                </div>
            )}
        </div>
    );
}

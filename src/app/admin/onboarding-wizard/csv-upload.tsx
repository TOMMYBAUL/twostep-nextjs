"use client";

import { useState } from "react";

interface CsvUploadProps {
    merchantId: string;
    onSuccess?: (count: number) => void;
}

export function CsvUpload({ merchantId, onSuccess }: CsvUploadProps) {
    const [count, setCount] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
        e.preventDefault();
        setError(null);
        setCount(null);

        if (!merchantId) {
            setError("Aucun merchant_id sélectionné — saisis d'abord un ID dans le wizard.");
            return;
        }

        setIsLoading(true);
        try {
            const form = new FormData(e.currentTarget);
            form.append("merchantId", merchantId);
            const res = await fetch("/api/admin/onboarding/csv", {
                method: "POST",
                body: form,
            });
            const json = (await res.json()) as { count?: number; error?: string };
            if (res.ok && typeof json.count === "number") {
                setCount(json.count);
                onSuccess?.(json.count);
            } else {
                setError(json.error ?? `HTTP ${res.status}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "unknown_error");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <div>
                <label htmlFor="csv-file" className="block text-sm text-secondary mb-1">
                    Fichier CSV (max 10 Mo, header obligatoire)
                </label>
                <input
                    id="csv-file"
                    type="file"
                    name="file"
                    accept=".csv,text/csv"
                    required
                    disabled={isLoading}
                    className="block w-full text-sm"
                />
            </div>
            <button
                type="submit"
                disabled={isLoading || !merchantId}
                className="px-4 py-2 bg-brand-solid text-white rounded disabled:bg-disabled disabled:text-disabled"
            >
                {isLoading ? "Import en cours…" : "Importer dans staging"}
            </button>
            {count !== null && (
                <p className="text-success-primary text-sm">
                    ✅ {count} ligne{count > 1 ? "s" : ""} importée{count > 1 ? "s" : ""} dans
                    import_staging.
                </p>
            )}
            {error && <p className="text-error-primary text-sm">⚠️ {error}</p>}
        </form>
    );
}

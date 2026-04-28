"use client";

import { useState } from "react";

export function ClipTestButton({ productId }: { productId: string }) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ status: number; body: unknown } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [elapsedMs, setElapsedMs] = useState<number | null>(null);

    async function run() {
        setLoading(true);
        setError(null);
        setResult(null);
        setElapsedMs(null);
        const t0 = performance.now();
        try {
            const res = await fetch("/api/admin/clip/embed-product", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId }),
            });
            const json = (await res.json()) as unknown;
            setResult({ status: res.status, body: json });
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setElapsedMs(Math.round(performance.now() - t0));
            setLoading(false);
        }
    }

    return (
        <div className="space-y-4">
            <button
                type="button"
                onClick={run}
                disabled={loading}
                className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
                {loading ? "Running… (3-5s expected)" : "Run CLIP embed test"}
            </button>

            {elapsedMs !== null && (
                <p className="text-xs text-gray-500">elapsed: {elapsedMs} ms</p>
            )}

            {result !== null && (
                <pre className="overflow-x-auto rounded border border-green-300 bg-green-50 p-3 text-xs text-gray-900">
                    HTTP {result.status}
                    {"\n"}
                    {JSON.stringify(result.body, null, 2)}
                </pre>
            )}

            {error && (
                <pre className="overflow-x-auto rounded border border-red-300 bg-red-50 p-3 text-xs text-red-900">
                    ERROR: {error}
                </pre>
            )}
        </div>
    );
}

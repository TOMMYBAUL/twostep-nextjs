"use client";

import { useEffect, useRef, useState } from "react";
import { MarkerPin01 } from "@untitledui/icons";

interface IntentSignal {
    id: string;
    selected_size: string | null;
    created_at: string;
    expires_at: string;
    products: { name: string; photo_url: string | null; photo_processed_url: string | null } | null;
    consumer_profiles: { display_name: string | null } | null;
}

export function IntentSignals({ merchantId }: { merchantId?: string }) {
    const [data, setData] = useState<IntentSignal[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!merchantId) return;

        async function fetchIntents() {
            try {
                const res = await fetch(`/api/merchants/${merchantId}/intents`);
                if (!res.ok) return;
                const json = await res.json();
                setData(json.intents ?? []);
            } catch {
                // silently ignore fetch errors
            }
        }

        function startInterval() {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(fetchIntents, 30_000);
        }

        function handleVisibilityChange() {
            if (document.hidden) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                intervalRef.current = null;
            } else {
                fetchIntents();
                startInterval();
            }
        }

        fetchIntents();
        startInterval();
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [merchantId]);

    if (data.length === 0) return null;

    return (
        <div className="mb-6">
            <h2 className="mb-3 text-sm font-bold text-primary">
                Clients en route ({data.length})
            </h2>
            <div className="space-y-2">
                {data.map((intent) => {
                    const minutesAgo = Math.round((Date.now() - new Date(intent.created_at).getTime()) / 60_000);
                    const name = intent.consumer_profiles?.display_name || "Un client";
                    const productName = intent.products?.name || "un produit";
                    const sizeText = intent.selected_size ? ` — Taille ${intent.selected_size}` : "";

                    return (
                        <div key={intent.id} className="flex items-start gap-3 rounded-xl bg-primary p-3 shadow-sm border-l-[3px] border-brand">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-secondary" aria-hidden="true">
                                <MarkerPin01 className="size-5 text-brand-secondary" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-primary">{name} arrive !</p>
                                <p className="mt-0.5 text-[11px] text-tertiary">
                                    {productName}{sizeText}
                                </p>
                            </div>
                            <span className="shrink-0 text-[10px] text-tertiary">
                                {minutesAgo < 1 ? "à l'instant" : `il y a ${minutesAgo} min`}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

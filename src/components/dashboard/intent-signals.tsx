"use client";

import { useEffect, useRef, useState } from "react";

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

        fetchIntents();
        intervalRef.current = setInterval(fetchIntents, 30_000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [merchantId]);

    if (data.length === 0) return null;

    return (
        <div className="mb-6">
            <h2 className="mb-3 text-sm font-bold text-[#1A1F36]">
                Clients en route ({data.length})
            </h2>
            <div className="space-y-2">
                {data.map((intent) => {
                    const minutesAgo = Math.round((Date.now() - new Date(intent.created_at).getTime()) / 60_000);
                    const name = intent.consumer_profiles?.display_name || "Un client";
                    const productName = intent.products?.name || "un produit";
                    const sizeText = intent.selected_size ? ` — Taille ${intent.selected_size}` : "";

                    return (
                        <div key={intent.id} className="flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm" style={{ borderLeft: "3px solid #4268FF" }}>
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FF] text-lg">
                                📍
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-semibold text-[#1A1F36]">{name} arrive !</p>
                                <p className="mt-0.5 text-[11px] text-[#8E96B0]">
                                    {productName}{sizeText}
                                </p>
                            </div>
                            <span className="shrink-0 text-[10px] text-[#8E96B0]">
                                il y a {minutesAgo < 1 ? "1" : minutesAgo} min
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

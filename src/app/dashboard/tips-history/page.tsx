"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMerchant } from "@/hooks/use-merchant";

const CATEGORIES = [
    { value: "", label: "Tous" },
    { value: "photos", label: "📸 Photos" },
    { value: "stock", label: "📦 Stock" },
    { value: "promos", label: "🏷️ Promos" },
    { value: "profil", label: "🏪 Profil" },
    { value: "engagement", label: "📈 Engagement" },
];

type Tip = {
    id: string;
    type: "insight" | "action";
    emoji: string;
    text: string;
    category: string;
    cta: { label: string; href: string } | null;
    created_at: string;
};

export default function TipsHistoryPage() {
    const { merchant } = useMerchant();
    const [tips, setTips] = useState<Tip[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [category, setCategory] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!merchant?.id) return;
        setLoading(true);

        const params = new URLSearchParams({ page: String(page) });
        if (category) params.set("category", category);

        fetch(`/api/merchants/${merchant.id}/tips/history?${params}`)
            .then((res) => res.json())
            .then((data) => {
                setTips(data.tips ?? []);
                setTotal(data.total ?? 0);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [merchant?.id, page, category]);

    const totalPages = Math.ceil(total / 20);

    function formatDate(iso: string) {
        const d = new Date(iso);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return "Hier";
        return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    }

    return (
        <div className="mx-auto max-w-2xl px-4 py-6">
            <div className="mb-6">
                <Link href="/dashboard" className="text-sm text-tertiary hover:text-brand-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                    ← Retour au dashboard
                </Link>
                <h1 className="mt-2 text-lg font-semibold text-primary">Historique des conseils</h1>
                <p className="text-sm text-primary">{total} conseil{total > 1 ? "s" : ""} au total</p>
            </div>

            {/* Filters */}
            <div className="mb-5 flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                    <button key={cat.value}
                        type="button"
                        onClick={() => { setCategory(cat.value); setPage(1); }}
                        className={`rounded-full border px-3.5 py-1.5 min-h-[44px] text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
                            category === cat.value
                                ? "border-brand bg-brand-solid text-white"
                                : "border-secondary bg-primary text-primary hover:border-brand hover:text-brand-secondary"
                        }`}>
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Tips list */}
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="animate-pulse rounded-lg bg-primary h-20" />
                    ))}
                </div>
            ) : tips.length === 0 ? (
                <p className="py-10 text-center text-sm text-tertiary">Aucun conseil pour le moment.</p>
            ) : (
                <div className="space-y-0 divide-y divide-secondary">
                    {tips.map((tip) => (
                        <div key={tip.id} className="flex gap-3 py-4">
                            <div className="min-w-[60px] pt-0.5 text-[11px] text-tertiary">
                                {formatDate(tip.created_at)}
                            </div>
                            <div className="flex-1">
                                <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    tip.type === "insight"
                                        ? "bg-brand-solid/10 text-brand-secondary"
                                        : "bg-success-secondary text-success-primary"
                                }`}>
                                    {tip.emoji} {tip.type === "insight" ? "Insight" : "Action"}
                                </span>
                                <p className="mt-1 text-[13px] leading-relaxed text-primary">{tip.text}</p>
                                <p className="mt-1 text-[11px] text-tertiary">
                                    {CATEGORIES.find((c) => c.value === tip.category)?.label || tip.category}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="rounded-lg border border-secondary px-3 py-1.5 min-h-[44px] text-xs text-primary disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none">
                        ← Précédent
                    </button>
                    <span className="text-xs text-tertiary">{page} / {totalPages}</span>
                    <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="rounded-lg border border-secondary px-3 py-1.5 min-h-[44px] text-xs text-primary disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none">
                        Suivant →
                    </button>
                </div>
            )}
        </div>
    );
}

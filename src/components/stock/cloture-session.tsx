"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";

interface Variant {
    productId: string;
    productName: string;
    photoUrl: string | null;
    category: string | null;
    size: string;
    quantity: number;
}

export function ClotureSession() {
    const router = useRouter();
    const { merchant } = useMerchant();
    const { products, refetch } = useProducts(merchant?.id);
    const { toast } = useToast();

    const startedAtRef = useRef<number>(Date.now());
    const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
    const [finishing, setFinishing] = useState(false);
    const [updating, setUpdating] = useState<string | null>(null);

    const variants: Variant[] = useMemo(() => {
        const out: Variant[] = [];
        for (const p of products) {
            if (!p.available_sizes || p.available_sizes.length === 0) continue;
            const canonical = p.canonical_name ?? p.name;
            for (const size of p.available_sizes) {
                if (size.quantity > 0) {
                    out.push({
                        productId: p.id,
                        productName: canonical,
                        photoUrl: p.photo_processed_url ?? p.photo_url,
                        category: p.category,
                        size: size.size,
                        quantity: size.quantity,
                    });
                }
            }
        }
        out.sort((a, b) => {
            const byName = a.productName.localeCompare(b.productName, "fr");
            if (byName !== 0) return byName;
            return a.size.localeCompare(b.size, "fr");
        });
        return out;
    }, [products]);

    const total = variants.length;
    const marked = markedIds.size;

    const markOut = async (variant: Variant) => {
        const key = `${variant.productId}:${variant.size}`;
        if (markedIds.has(key)) return;
        const product = products.find((p) => p.id === variant.productId);
        if (!product) return;

        const previous = (product.available_sizes ?? []) as { size: string; quantity: number }[];
        const next = previous.map((v) => v.size === variant.size ? { ...v, quantity: 0 } : v);

        setUpdating(key);
        try {
            const res = await fetch(`/api/products/${variant.productId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ available_sizes: next }),
            });
            if (!res.ok) throw new Error("patch failed");
            const totalQty = next.reduce((sum, v) => sum + v.quantity, 0);
            await fetch("/api/stock", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: variant.productId, quantity: totalQty }),
            });
            setMarkedIds((prev) => new Set(prev).add(key));
            toast(`${variant.size} marqué en rupture`, {
                action: {
                    label: "Annuler",
                    onClick: async () => {
                        setMarkedIds((prev) => {
                            const n = new Set(prev);
                            n.delete(key);
                            return n;
                        });
                        await fetch(`/api/products/${variant.productId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ available_sizes: previous }),
                        });
                        const prevTotal = previous.reduce((s, v) => s + v.quantity, 0);
                        await fetch("/api/stock", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ product_id: variant.productId, quantity: prevTotal }),
                        });
                        await refetch();
                    },
                },
            });
        } catch {
            toast("Erreur — ressaie", "error");
        } finally {
            setUpdating(null);
        }
    };

    const handleFinish = async () => {
        setFinishing(true);
        try {
            const duration = Math.round((Date.now() - startedAtRef.current) / 1000);
            const res = await fetch("/api/stock/cloture", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ variants_marked_out: marked, duration_seconds: duration }),
            });
            if (res.ok) {
                const data = (await res.json()) as { streak?: number };
                const streak = data.streak ?? 0;
                toast(streak > 1 ? `Clôture enregistrée · 🔥 ${streak} jours` : "Clôture enregistrée");
            } else {
                toast("Impossible d'enregistrer la clôture", "error");
            }
            router.push("/dashboard/stock/mon-stock");
        } finally {
            setFinishing(false);
        }
    };

    if (variants.length === 0 && marked === 0) {
        return (
            <div className="mx-auto max-w-md py-12 text-center">
                <div className="mb-4 text-5xl">✨</div>
                <h1 className="mb-2 font-display text-xl font-bold uppercase text-primary">Tout est à jour</h1>
                <p className="mb-6 text-sm text-tertiary">
                    Pas de variantes dispo à passer en revue — soit ta boutique est vide, soit ton stock est déjà à jour.
                </p>
                <Link
                    href="/dashboard/stock/mon-stock"
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-solid px-5 py-3 text-sm font-semibold text-white"
                >
                    Retour à mon stock
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl pb-24">
            <Link href="/dashboard/stock/mon-stock" className="mb-2 inline-block text-sm text-tertiary hover:text-secondary">
                ← Mon stock
            </Link>

            <div className="mb-4 flex items-start gap-3">
                <span className="text-3xl" aria-hidden="true">🌙</span>
                <div>
                    <h1 className="font-display text-xl font-bold uppercase text-primary">Clôture du soir</h1>
                    <p className="text-xs text-tertiary">
                        Tape uniquement sur les variantes <strong className="text-primary">épuisées</strong> · {total} à passer en revue
                    </p>
                </div>
            </div>

            <div className="space-y-1.5">
                {variants.map((v) => {
                    const key = `${v.productId}:${v.size}`;
                    const done = markedIds.has(key);
                    return (
                        <div
                            key={key}
                            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                                done ? "border-error-primary bg-error-secondary/50" : "border-secondary bg-primary"
                            }`}
                        >
                            {v.photoUrl ? (
                                <Image src={v.photoUrl} alt={v.productName} width={36} height={36} className="size-9 shrink-0 rounded-lg object-cover" />
                            ) : (
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm">📦</div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-primary">{v.productName}</p>
                                <p className="text-[11px] text-tertiary">
                                    Taille <span className="font-semibold text-primary">{v.size}</span>
                                    {v.category ? ` · ${v.category}` : null}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => markOut(v)}
                                disabled={done || updating === key}
                                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition min-w-[96px] text-center ${
                                    done
                                        ? "bg-error-solid text-white"
                                        : "bg-secondary text-secondary hover:bg-secondary_hover"
                                }`}
                            >
                                {done ? "Rupture ✓" : updating === key ? "…" : "Rupture"}
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-secondary bg-primary px-4 py-3 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] md:bottom-4 md:left-auto md:right-4 md:max-w-md md:rounded-2xl md:border">
                <div className="mb-2 flex items-center justify-between text-xs text-tertiary">
                    <span>{marked} / {total} variantes revues</span>
                    <span className="font-medium text-primary">
                        {total === 0 ? "100%" : Math.round((marked / total) * 100) + "%"}
                    </span>
                </div>
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                        className="h-full bg-brand-solid transition-[width]"
                        style={{ width: total === 0 ? "100%" : `${(marked / total) * 100}%` }}
                    />
                </div>
                <button
                    type="button"
                    onClick={handleFinish}
                    disabled={finishing}
                    className="w-full rounded-xl bg-brand-solid py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                >
                    {finishing ? "Enregistrement…" : "Terminer ma clôture"}
                </button>
            </div>
        </div>
    );
}

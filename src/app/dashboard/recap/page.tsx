"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Minus, Plus, RefreshCw05 } from "@untitledui/icons";
import { PageHeader } from "@/components/dashboard/page-header";
import { StockTabs } from "@/components/dashboard/stock-tabs";
import { MetricCard } from "@/components/dashboard/metric-card";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";
import { SizeDisplay } from "@/components/dashboard/size-display";
import type { SizeEntry } from "@/lib/types";

/* ── Helpers ── */

function getQty(p: ProductWithStock): number {
    const s = p.stock;
    if (!s) return 0;
    if (Array.isArray(s)) return s[0]?.quantity ?? 0;
    return (s as { quantity: number }).quantity ?? 0;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
}

/* ── Types ── */

type ProductWithStock = {
    id: string;
    name: string;
    canonical_name: string | null;
    category: string | null;
    photo_url: string | null;
    photo_processed_url: string | null;
    available_sizes?: SizeEntry[] | null;
    stock?: { quantity: number }[];
};

/* ── POS branch: automatic sync stats ── */

function POSView({ merchant }: { merchant: { name: string; pos_type: string; pos_last_sync: string | null } }) {
    const lastSync = merchant.pos_last_sync
        ? new Date(merchant.pos_last_sync).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })
        : "jamais";

    return (
        <div className="flex flex-col items-center gap-6 py-12">
            <div className="flex size-20 items-center justify-center rounded-full bg-success-secondary">
                <Check className="size-10 text-fg-success-primary" />
            </div>
            <div className="text-center">
                <h2 className="text-xl font-semibold text-primary">Synchro automatique</h2>
                <p className="mt-2 text-sm text-tertiary">
                    Votre caisse <strong className="text-secondary">{merchant.pos_type}</strong> met
                    à jour vos ventes en temps réel.
                </p>
                <p className="mt-1 text-xs text-quaternary">
                    Dernière synchro : {lastSync}
                </p>
            </div>
            <Link
                href="/dashboard/products"
                className="rounded-xl bg-brand-solid px-6 py-3 text-sm font-semibold text-white no-underline hover:bg-brand-solid_hover"
            >
                Voir mon catalogue
            </Link>
        </div>
    );
}

/* ── Empty state ── */

function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-5 py-16">
            <div className="flex size-16 items-center justify-center rounded-full bg-secondary">
                <svg className="size-7 text-quaternary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
            </div>
            <div className="max-w-xs text-center">
                <h2 className="text-base font-semibold text-primary">Rien à mettre à jour</h2>
                <p className="mt-2 text-sm leading-relaxed text-tertiary">
                    Importez d'abord votre catalogue dans l'onglet <strong className="text-secondary">Entrées</strong>.
                    Vos produits apparaîtront ici pour que vous puissiez suivre les ventes du jour.
                </p>
            </div>
            <Link
                href="/dashboard/invoices"
                className="rounded-xl bg-brand-solid px-6 py-3 text-sm font-semibold text-white no-underline hover:bg-brand-solid_hover"
            >
                Importer mon catalogue
            </Link>
        </div>
    );
}

/* ── Product row with quantity controls ── */

function ProductRow({
    product,
    updating,
    onDelta,
    onMarkOut,
    onRestock,
}: {
    product: ProductWithStock;
    updating: boolean;
    onDelta: (delta: number) => void;
    onMarkOut: () => void;
    onRestock: () => void;
}) {
    const photo = product.photo_processed_url ?? product.photo_url;
    const name = product.canonical_name ?? product.name;
    const qty = getQty(product);
    const isOut = qty === 0;

    return (
        <div
            className={`flex items-center gap-3 rounded-2xl border p-4 transition ${
                isOut ? "border-error/30 bg-error-secondary/30" : "border-secondary bg-primary"
            } ${updating ? "opacity-60" : ""}`}
        >
            {photo ? (
                <Image
                    src={photo}
                    alt={name}
                    width={44}
                    height={44}
                    className={`size-11 shrink-0 rounded-lg object-cover ${isOut ? "grayscale" : ""}`}
                />
            ) : (
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-lg">
                    📦
                </div>
            )}

            <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${isOut ? "text-tertiary" : "text-primary"}`}>{name}</p>
                {product.category && <p className="text-xs text-tertiary">{product.category}</p>}
                {product.available_sizes && product.available_sizes.length > 0 && (
                    <SizeDisplay sizes={product.available_sizes} hasPOS={false} />
                )}
            </div>

            {isOut ? (
                <button
                    type="button"
                    onClick={onRestock}
                    disabled={updating}
                    className="shrink-0 rounded-lg bg-brand-solid px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-solid_hover"
                >
                    Remettre
                </button>
            ) : (
                <div className="flex shrink-0 items-center gap-1.5">
                    {/* Minus button */}
                    <button
                        type="button"
                        onClick={() => { if (qty === 1) onMarkOut(); else onDelta(-1); }}
                        disabled={updating}
                        className="flex size-9 items-center justify-center rounded-lg border border-secondary bg-primary text-secondary transition hover:bg-secondary"
                    >
                        <Minus className="size-4" />
                    </button>

                    {/* Quantity display */}
                    <span className="w-8 text-center text-sm font-bold text-primary">{qty}</span>

                    {/* Plus button */}
                    <button
                        type="button"
                        onClick={() => onDelta(1)}
                        disabled={updating}
                        className="flex size-9 items-center justify-center rounded-lg border border-secondary bg-primary text-secondary transition hover:bg-secondary"
                    >
                        <Plus className="size-4" />
                    </button>
                </div>
            )}
        </div>
    );
}

/* ── Non-POS branch: quantity management ── */

function NonPOSView({
    products,
    loading,
    updateStock,
    refetch,
}: {
    products: ProductWithStock[];
    loading: boolean;
    updateStock: (productId: string, delta?: number, absolute?: number) => Promise<void>;
    refetch: () => Promise<void>;
}) {
    const { toast } = useToast();
    const [updating, setUpdating] = useState<Set<string>>(new Set());
    const [confirmed, setConfirmed] = useState(false);
    const [lastConfirmedAt, setLastConfirmedAt] = useState<string | null>(
        () => {
            if (typeof window === "undefined") return null;
            return localStorage.getItem("twostep_last_recap");
        }
    );

    const available = products.filter((p) => getQty(p) > 0);
    const unavailable = products.filter((p) => getQty(p) === 0);

    const withUpdating = useCallback(async (productId: string, fn: () => Promise<void>) => {
        setUpdating((prev) => new Set(prev).add(productId));
        try {
            await fn();
            await refetch();
        } catch {
            toast("Erreur de mise à jour", "error");
        } finally {
            setUpdating((prev) => {
                const next = new Set(prev);
                next.delete(productId);
                return next;
            });
        }
    }, [refetch, toast]);

    const handleDelta = (product: ProductWithStock, delta: number) => {
        withUpdating(product.id, () => updateStock(product.id, delta));
    };

    const handleMarkOut = (product: ProductWithStock) => {
        withUpdating(product.id, async () => {
            await updateStock(product.id, undefined, 0);
            toast(`${product.canonical_name ?? product.name} — marqué épuisé`);
        });
    };

    const handleRestock = (product: ProductWithStock) => {
        withUpdating(product.id, async () => {
            await updateStock(product.id, undefined, 1);
            toast(`${product.canonical_name ?? product.name} — remis en stock`);
        });
    };

    const handleAllOk = () => {
        const now = new Date().toISOString();
        setConfirmed(true);
        setLastConfirmedAt(now);
        localStorage.setItem("twostep_last_recap", now);
        toast("Stock confirmé — tout est à jour");
    };

    if (loading) {
        return (
            <div className="flex flex-col gap-2 py-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-2xl border border-secondary bg-primary p-4" />
                ))}
            </div>
        );
    }

    if (products.length === 0) {
        return <EmptyState />;
    }

    if (confirmed) {
        return (
            <div className="flex flex-col items-center justify-center gap-6 py-20">
                <div className="flex size-16 items-center justify-center rounded-full bg-success-secondary">
                    <Check className="size-8 text-fg-success-primary" />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-primary">Stock confirmé</h2>
                    <p className="mt-1 text-sm text-tertiary">
                        {available.length} produit{available.length > 1 ? "s" : ""} disponible{available.length > 1 ? "s" : ""}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setConfirmed(false)}
                    className="text-sm font-medium text-brand-secondary no-underline hover:text-brand-secondary_hover"
                >
                    Modifier quand même →
                </button>
            </div>
        );
    }

    return (
        <>
            {/* Metrics */}
            <div className="mb-4 grid grid-cols-2 gap-3">
                <MetricCard label="Disponibles" value={available.length} staggerIndex={0} />
                <MetricCard label="Épuisés" value={unavailable.length} variant={unavailable.length > 0 ? "danger" : undefined} staggerIndex={1} />
            </div>

            {/* Last recap indicator */}
            {lastConfirmedAt && (
                <p className="mb-4 text-center text-xs text-quaternary">
                    Dernier récap : {timeAgo(lastConfirmedAt)}
                </p>
            )}

            <p className="mb-5 text-sm text-tertiary">
                Ajustez les quantités vendues. Si tout est bon, confirmez en bas.
            </p>

            {/* Available products — with ± controls */}
            {available.length > 0 && (
                <div className="mb-6">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-quaternary">
                        En rayon ({available.length})
                    </h3>
                    <div className="flex flex-col gap-2">
                        {available.map((product) => (
                            <ProductRow
                                key={product.id}
                                product={product}
                                updating={updating.has(product.id)}
                                onDelta={(d) => handleDelta(product, d)}
                                onMarkOut={() => handleMarkOut(product)}
                                onRestock={() => handleRestock(product)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Unavailable products — with restock button */}
            {unavailable.length > 0 && (
                <div className="mb-6">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-quaternary">
                        Épuisés ({unavailable.length})
                    </h3>
                    <div className="flex flex-col gap-2">
                        {unavailable.map((product) => (
                            <ProductRow
                                key={product.id}
                                product={product}
                                updating={updating.has(product.id)}
                                onDelta={(d) => handleDelta(product, d)}
                                onMarkOut={() => handleMarkOut(product)}
                                onRestock={() => handleRestock(product)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Confirm button */}
            {available.length > 0 && (
                <div className="sticky bottom-20 z-10 mt-4 md:bottom-4">
                    <button
                        type="button"
                        onClick={handleAllOk}
                        className="w-full rounded-2xl bg-brand-solid px-6 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-brand-solid_hover"
                    >
                        Tout est OK — confirmer le stock
                    </button>
                </div>
            )}
        </>
    );
}

/* ── Main page ── */

export default function RecapPage() {
    const { merchant } = useMerchant();
    const { products, loading, updateStock, refetch } = useProducts(merchant?.id);
    const hasPOS = !!merchant?.pos_type;

    return (
        <div className="mx-auto max-w-lg">
            <PageHeader
                storeName={merchant?.name}
                title="Mes"
                titleAccent="ventes"
            />

            <StockTabs />

            {hasPOS && merchant ? (
                <POSView merchant={{ name: merchant.name, pos_type: merchant.pos_type!, pos_last_sync: merchant.pos_last_sync }} />
            ) : (
                <NonPOSView products={products} loading={loading} updateStock={updateStock} refetch={refetch} />
            )}
        </div>
    );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, RefreshCw05 } from "@untitledui/icons";
import { PageHeader } from "@/components/dashboard/page-header";
import { StockTabs } from "@/components/dashboard/stock-tabs";
import { MetricCard } from "@/components/dashboard/metric-card";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";
import { SizeDisplay } from "@/components/dashboard/size-display";
import type { SizeEntry } from "@/lib/types";

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

/* ── Non-POS branch: availability toggles ── */

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

function NonPOSView({
    products,
    loading,
    updateStock,
}: {
    products: ProductWithStock[];
    loading: boolean;
    updateStock: (productId: string, delta?: number, absolute?: number) => Promise<void>;
}) {
    const { toast } = useToast();
    const [toggling, setToggling] = useState<Set<string>>(new Set());
    const [confirmed, setConfirmed] = useState(false);

    const getQty = (p: any): number => { const s = p.stock; if (!s) return 0; if (Array.isArray(s)) return s[0]?.quantity ?? 0; return s.quantity ?? 0; };
    const available = products.filter((p) => getQty(p) > 0);
    const unavailable = products.filter((p) => getQty(p) === 0);

    const handleMarkUnavailable = async (product: ProductWithStock) => {
        setToggling((prev) => new Set(prev).add(product.id));
        try {
            await updateStock(product.id, undefined, 0);
            toast(`${product.canonical_name ?? product.name} — marqué épuisé`);
        } catch {
            toast("Erreur de mise à jour", "error");
        } finally {
            setToggling((prev) => {
                const next = new Set(prev);
                next.delete(product.id);
                return next;
            });
        }
    };

    const handleAllOk = () => {
        setConfirmed(true);
        toast("Stock confirmé — tout est disponible");
        // TODO: persister last_stock_confirmed_at en DB via PATCH /api/merchants/:id
        // (champ absent de la table merchants pour l'instant — nice-to-have)
    };

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
                <Link
                    href="/dashboard/products"
                    className="rounded-xl bg-brand-solid px-6 py-3 text-sm font-semibold text-white no-underline hover:bg-brand-solid_hover"
                >
                    Voir mes produits
                </Link>
            </div>
        );
    }

    return (
        <>
            <div className="mb-6 grid grid-cols-2 gap-3">
                <MetricCard label="Disponibles" value={available.length} staggerIndex={0} />
                <MetricCard label="Indisponibles" value={unavailable.length} variant={unavailable.length > 0 ? "danger" : undefined} staggerIndex={1} />
            </div>

            <p className="mb-4 text-sm text-tertiary">
                Touchez un produit pour changer son statut. Si tout est bon, confirmez en bas.
            </p>

            {loading ? (
                <div className="flex flex-col gap-2 py-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="animate-pulse rounded-2xl border border-secondary bg-primary p-4 h-16" />
                    ))}
                </div>
            ) : products.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16">
                    <p className="text-sm text-tertiary">Aucun produit dans votre catalogue.</p>
                    <Link
                        href="/dashboard/invoices"
                        className="rounded-xl bg-brand-solid px-6 py-3 text-sm font-semibold text-white no-underline hover:bg-brand-solid_hover"
                    >
                        Importer mon catalogue
                    </Link>
                </div>
            ) : (
                <>
                    {/* Available products — can be marked as épuisé */}
                    {available.length > 0 && (
                        <div className="mb-6">
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-quaternary">
                                En rayon ({available.length})
                            </h3>
                            <div className="flex flex-col gap-2">
                                {available.map((product) => (
                                    <ProductToggleRow
                                        key={product.id}
                                        product={product}
                                        isAvailable
                                        isToggling={toggling.has(product.id)}
                                        onToggle={() => handleMarkUnavailable(product)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Unavailable products — read only, restock via Entrées */}
                    {unavailable.length > 0 && (
                        <div className="mb-6">
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-quaternary">
                                Épuisés ({unavailable.length})
                            </h3>
                            <p className="mb-3 text-xs text-tertiary">
                                Ces produits redeviendront disponibles quand vous recevrez du stock (onglet Entrées).{" "}
                                <Link href="/dashboard/products" className="font-medium text-brand-secondary no-underline hover:text-brand-secondary_hover">
                                    Une erreur ? Modifier dans Catalogue →
                                </Link>
                            </p>
                            <div className="flex flex-col gap-2 opacity-60">
                                {unavailable.map((product) => {
                                    const photo = product.photo_processed_url ?? product.photo_url;
                                    const name = product.canonical_name ?? product.name;
                                    return (
                                        <div
                                            key={product.id}
                                            className="flex items-center gap-3 rounded-2xl border border-secondary bg-primary p-4"
                                        >
                                            {photo ? (
                                                <Image
                                                    src={photo}
                                                    alt={name}
                                                    width={40}
                                                    height={40}
                                                    className="size-10 shrink-0 rounded-lg object-cover grayscale"
                                                />
                                            ) : (
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-lg">
                                                    📦
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-tertiary">{name}</p>
                                            </div>
                                            <span className="rounded-lg bg-error-secondary px-3 py-1.5 text-xs font-semibold text-error-primary">
                                                Épuisé
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Confirm button — only if there are available products */}
                    {available.length > 0 && (
                        <div className="sticky bottom-20 z-10 mt-4 md:bottom-4">
                            <button
                                type="button"
                                onClick={handleAllOk}
                                className="w-full rounded-2xl bg-brand-solid px-6 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-brand-solid_hover"
                            >
                                Tout est OK — confirmer
                            </button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}

/* ── Toggle row component ── */

function ProductToggleRow({
    product,
    isAvailable,
    isToggling,
    onToggle,
}: {
    product: ProductWithStock;
    isAvailable: boolean;
    isToggling: boolean;
    onToggle: () => void;
}) {
    const photo = product.photo_processed_url ?? product.photo_url;
    const name = product.canonical_name ?? product.name;

    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={isToggling}
            className={`flex w-full items-center gap-3 rounded-2xl border border-secondary bg-primary p-4 text-left transition hover:bg-primary_hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${isToggling ? "opacity-60" : ""}`}
        >
            {photo ? (
                <Image
                    src={photo}
                    alt={name}
                    width={40}
                    height={40}
                    className="size-10 shrink-0 rounded-lg object-cover"
                />
            ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-lg">
                    📦
                </div>
            )}
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">{name}</p>
                {product.category && (
                    <p className="text-xs text-tertiary">{product.category}</p>
                )}
                {product.available_sizes && product.available_sizes.length > 0 && (
                    <SizeDisplay sizes={product.available_sizes} hasPOS={false} />
                )}
            </div>

            {isToggling ? (
                <RefreshCw05 className="size-4 shrink-0 animate-spin text-tertiary" />
            ) : (
                <span className="shrink-0 rounded-lg bg-error-secondary px-3 py-1.5 text-xs font-semibold text-error-primary transition">
                    Épuisé
                </span>
            )}
        </button>
    );
}

/* ── Main page ── */

export default function RecapPage() {
    const { merchant } = useMerchant();
    const { products, loading, updateStock } = useProducts(merchant?.id);
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
                <NonPOSView products={products} loading={loading} updateStock={updateStock} />
            )}
        </div>
    );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check } from "@untitledui/icons";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";

type SoldEntry = { productId: string; qty: number };

const QTY_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

export default function RecapPage() {
    const { merchant } = useMerchant();
    const { products, loading, updateStock } = useProducts(merchant?.id);
    const { toast } = useToast();
    const [sold, setSold] = useState<Map<string, number>>(new Map());
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);

    // Only show products with stock > 0, sorted by most recent sales (created_at as proxy)
    const inStock = products
        .filter((p) => (p.stock?.[0]?.quantity ?? 0) > 0)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const handleSelect = (productId: string, qty: number) => {
        setSold((prev) => {
            const next = new Map(prev);
            if (qty === 0) {
                next.delete(productId);
            } else {
                next.set(productId, qty);
            }
            return next;
        });
    };

    const totalSold = Array.from(sold.values()).reduce((sum, q) => sum + q, 0);

    const handleSubmit = async () => {
        if (sold.size === 0) {
            toast("Aucune vente à enregistrer");
            return;
        }

        setSubmitting(true);
        let errors = 0;

        for (const [productId, qty] of sold) {
            try {
                await updateStock(productId, -qty);
            } catch {
                errors++;
            }
        }

        setSubmitting(false);

        if (errors === 0) {
            setDone(true);
            toast(`${totalSold} vente${totalSold > 1 ? "s" : ""} enregistrée${totalSold > 1 ? "s" : ""}`);
        } else {
            toast(`${errors} erreur${errors > 1 ? "s" : ""} sur ${sold.size} produits`, "error");
        }
    };

    if (done) {
        return (
            <div className="flex flex-col items-center justify-center gap-6 py-20">
                <div className="flex size-16 items-center justify-center rounded-full bg-success-secondary">
                    <Check className="size-8 text-fg-success-primary" />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-primary">Récap enregistré</h2>
                    <p className="mt-1 text-sm text-tertiary">
                        {totalSold} vente{totalSold > 1 ? "s" : ""} — stock mis à jour
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
        <div className="mx-auto max-w-lg">
            {/* Header */}
            <div className="mb-6 flex items-center gap-3">
                <Link href="/dashboard/products" className="text-fg-quaternary hover:text-fg-secondary">
                    <ArrowLeft className="size-5" />
                </Link>
                <div>
                    <h1 className="text-xl font-semibold text-primary">Récap du jour</h1>
                    <p className="text-sm text-tertiary">Combien avez-vous vendu aujourd'hui ?</p>
                </div>
            </div>

            {loading ? (
                <div className="py-20 text-center text-sm text-tertiary">Chargement...</div>
            ) : inStock.length === 0 ? (
                <div className="py-20 text-center text-sm text-tertiary">Aucun produit en stock</div>
            ) : (
                <>
                    {/* Product list */}
                    <div className="flex flex-col gap-3">
                        {inStock.map((product) => {
                            const qty = product.stock?.[0]?.quantity ?? 0;
                            const selectedQty = sold.get(product.id) ?? 0;
                            const photo = product.photo_processed_url ?? product.photo_url;

                            return (
                                <div
                                    key={product.id}
                                    className="rounded-2xl border border-secondary bg-primary p-4"
                                >
                                    {/* Product info */}
                                    <div className="mb-3 flex items-center gap-3">
                                        {photo ? (
                                            <Image
                                                src={photo}
                                                alt={product.name}
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
                                            <p className="truncate text-sm font-medium text-primary">
                                                {product.canonical_name ?? product.name}
                                            </p>
                                            <p className="text-xs text-tertiary">
                                                {qty} en stock
                                            </p>
                                        </div>
                                    </div>

                                    {/* Quantity buttons */}
                                    <div className="flex gap-2">
                                        {QTY_OPTIONS.map((q) => (
                                            <button
                                                key={q}
                                                type="button"
                                                onClick={() => handleSelect(product.id, q)}
                                                disabled={q > qty}
                                                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                                                    selectedQty === q && q > 0
                                                        ? "bg-brand-solid text-white shadow-sm"
                                                        : selectedQty === 0 && q === 0
                                                            ? "bg-secondary text-tertiary"
                                                            : "bg-secondary text-secondary hover:bg-secondary_hover"
                                                } ${q > qty ? "cursor-not-allowed opacity-30" : ""}`}
                                            >
                                                {q === 0 ? "—" : q === 5 ? "5+" : q}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Submit bar */}
                    <div className="sticky bottom-20 z-10 mt-6 md:bottom-4">
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting || sold.size === 0}
                            className="w-full rounded-2xl bg-brand-solid px-6 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-brand-solid_hover disabled:opacity-40"
                        >
                            {submitting
                                ? "Enregistrement..."
                                : sold.size === 0
                                    ? "Sélectionnez vos ventes"
                                    : `Enregistrer ${totalSold} vente${totalSold > 1 ? "s" : ""}`}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

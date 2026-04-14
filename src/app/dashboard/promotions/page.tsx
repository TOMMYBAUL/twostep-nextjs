"use client";

import { useState, type FormEvent } from "react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";
import { usePromotions } from "@/hooks/use-promotions";

export default function PromotionsPage() {
    const { merchant } = useMerchant();
    const { products } = useProducts(merchant?.id);
    const { promotions, loading, createPromotion, deletePromotion } = usePromotions(merchant?.id);
    const { toast } = useToast();

    const [showForm, setShowForm] = useState(false);
    const [productId, setProductId] = useState("");
    const [salePrice, setSalePrice] = useState("");
    const [endsAt, setEndsAt] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const handleCreate = async (e: FormEvent) => {
        e.preventDefault();
        if (!productId || !salePrice) return;

        const selectedProduct = products.find((p) => p.id === productId);
        if (selectedProduct?.price !== undefined && selectedProduct.price !== null && Number(salePrice) >= selectedProduct.price) {
            toast("Le prix promo doit être inférieur au prix original", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            await createPromotion({
                product_id: productId,
                sale_price: Number(salePrice),
                ends_at: endsAt || null,
            });
            toast("Promotion créée");
            setShowForm(false);
            setProductId("");
            setSalePrice("");
            setEndsAt("");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deletePromotion(id);
            toast("Promotion supprimée");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        }
    };

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Mes"
                titleAccent="promotions"
                action={
                    <button type="button" onClick={() => setShowForm(!showForm)} className="btn-ts">
                        {showForm ? "Fermer" : "+ Nouvelle promotion"}
                    </button>
                }
            />

            {/* Create form */}
            {showForm && (
                <form onSubmit={handleCreate} className="animate-fade-up mb-8 rounded-xl bg-primary p-6 max-w-xl space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-secondary">Produit</label>
                        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="search-ts w-full">
                            <option value="">Choisir un produit...</option>
                            {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.canonical_name ?? p.name} — {p.price?.toFixed(2)} €
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-secondary">Prix promotionnel (€)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={salePrice}
                            onChange={(e) => setSalePrice(e.target.value)}
                            className="search-ts w-full"
                            placeholder="0.00"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-secondary">Date de fin (optionnel)</label>
                        <input
                            type="date"
                            value={endsAt}
                            onChange={(e) => setEndsAt(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                            className="search-ts w-full"
                        />
                    </div>
                    <button type="submit" className="btn-ts" disabled={isSubmitting}>
                        {isSubmitting ? "..." : "Lancer la promotion"}
                    </button>
                </form>
            )}

            {/* Promotions list */}
            {loading ? (
                <div className="flex flex-col gap-1.5">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse rounded-xl bg-primary px-4 py-5" />
                    ))}
                </div>
            ) : promotions.length === 0 ? (
                <EmptyState
                    icon="🏷️"
                    title="Aucune promotion active"
                    description="Créez une promotion pour mettre en avant vos produits."
                    action={
                        <button type="button" onClick={() => setShowForm(true)} className="btn-ts">
                            Créer une promotion
                        </button>
                    }
                />
            ) : (
                <div className="flex flex-col gap-1.5">
                    {promotions.map((promo, i) => {
                        const now = new Date();
                        const startsAt = new Date(promo.starts_at);
                        const isScheduled = startsAt > now;

                        return (
                            <div
                                key={promo.id}
                                className={`animate-fade-up stagger-${Math.min(i + 3, 10)} flex items-center gap-4 rounded-xl bg-primary px-5 py-4`}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-primary">
                                        {promo.products?.canonical_name ?? promo.products?.name ?? "Produit"}
                                    </p>
                                    <p className="text-xs text-tertiary mt-0.5">
                                        <span className="line-through">{promo.products?.price?.toFixed(2)} €</span>
                                        {" → "}
                                        <span className="font-semibold text-brand-secondary">
                                            {promo.sale_price.toFixed(2)} €
                                        </span>
                                    </p>
                                </div>

                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isScheduled ? "bg-secondary text-secondary" : "bg-success-secondary text-success-primary"}`}>
                                    {isScheduled ? "Programmée" : "Active"}
                                </span>

                                {promo.ends_at && (
                                    <span className="text-xs text-tertiary">
                                        Fin : {new Date(promo.ends_at).toLocaleDateString("fr-FR")}
                                    </span>
                                )}

                                {confirmDeleteId === promo.id ? (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => { handleDelete(promo.id); setConfirmDeleteId(null); }}
                                            className="rounded-lg bg-error-solid px-2.5 py-1 text-[11px] font-medium text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                        >
                                            Confirmer
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="text-[11px] text-tertiary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded"
                                        >
                                            Annuler
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(promo.id)}
                                        className="text-xs text-error-primary hover:text-error-primary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded"
                                    >
                                        Supprimer
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}

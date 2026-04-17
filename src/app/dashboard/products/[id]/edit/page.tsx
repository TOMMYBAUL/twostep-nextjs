"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductForm } from "@/components/dashboard/product-form";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";

export default function EditProductPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { merchant } = useMerchant();
    const { products, loading: productsLoading, updateProduct, deleteProduct } = useProducts(merchant?.id);
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const product = products.find((p) => p.id === id);

    const handleSubmit = async (values: { name: string; description: string; ean: string; category: string; price: number }) => {
        setIsLoading(true);
        try {
            await updateProduct(id, {
                name: values.name,
                description: values.description || null,
                ean: values.ean || null,
                category: values.category || null,
                price: values.price,
                // Preserve existing sizes — the edit form doesn't manage them
                available_sizes: (product as any)?.available_sizes ?? null,
            });
            toast("Produit mis à jour");
            router.push("/dashboard/products");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        try {
            await deleteProduct(id);
            toast("Produit supprimé");
            router.push("/dashboard/products");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        }
    };

    if (!merchant || productsLoading) {
        return <div className="animate-pulse py-12 text-center text-sm text-tertiary">Chargement...</div>;
    }

    if (!product) {
        return <div className="py-12 text-center text-sm text-tertiary">Produit introuvable</div>;
    }

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Modifier"
                titleAccent={product.canonical_name ?? product.name}
                action={
                    <Link href="/dashboard/products" className="text-sm text-tertiary hover:text-secondary no-underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                        ← Retour
                    </Link>
                }
            />

            <ProductForm
                initialValues={{
                    name: product.name,
                    description: product.description ?? "",
                    ean: product.ean ?? "",
                    category: product.category ?? "",
                    price: product.price?.toString() ?? "",
                    initialQuantity: "0",
                    photoUrl: (product as any).photo_processed_url ?? (product as any).photo_url ?? null,
                }}
                productId={id}
                onSubmit={handleSubmit}
                submitLabel="Enregistrer"
                isLoading={isLoading}
            />

            {/* Delete */}
            <div className="mt-12 border-t border-secondary pt-6 max-w-xl">
                {showDeleteConfirm ? (
                    <div className="flex items-center gap-3">
                        <p className="text-sm text-error-primary">Supprimer définitivement ?</p>
                        <button type="button" onClick={handleDelete} className="rounded-lg bg-error-solid px-3 py-1.5 text-xs font-medium text-white focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none">
                            Confirmer
                        </button>
                        <button type="button" onClick={() => setShowDeleteConfirm(false)} className="text-xs text-tertiary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                            Annuler
                        </button>
                    </div>
                ) : (
                    <button type="button" onClick={() => setShowDeleteConfirm(true)} className="text-sm text-error-primary hover:text-error-primary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                        Supprimer ce produit
                    </button>
                )}
            </div>
        </>
    );
}

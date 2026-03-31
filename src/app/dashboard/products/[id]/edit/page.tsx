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
    const { products, updateProduct, deleteProduct } = useProducts(merchant?.id);
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

    if (!product && !merchant) {
        return <div className="animate-pulse py-12 text-center text-sm text-gray-400">Chargement...</div>;
    }

    if (!product) {
        return <div className="py-12 text-center text-sm text-gray-400">Produit introuvable</div>;
    }

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Modifier"
                titleAccent={product.canonical_name ?? product.name}
                action={
                    <Link href="/dashboard/products" className="text-sm text-gray-400 hover:text-gray-600 no-underline">
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
            <div className="mt-12 border-t border-gray-200 pt-6 max-w-xl">
                {showDeleteConfirm ? (
                    <div className="flex items-center gap-3">
                        <p className="text-sm text-red-600">Supprimer définitivement ?</p>
                        <button onClick={handleDelete} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white">
                            Confirmer
                        </button>
                        <button onClick={() => setShowDeleteConfirm(false)} className="text-xs text-gray-400">
                            Annuler
                        </button>
                    </div>
                ) : (
                    <button onClick={() => setShowDeleteConfirm(true)} className="text-sm text-red-500 hover:text-red-700">
                        Supprimer ce produit
                    </button>
                )}
            </div>
        </>
    );
}

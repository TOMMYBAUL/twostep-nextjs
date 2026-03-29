"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductForm } from "@/components/dashboard/product-form";
import { TabNav } from "@/components/dashboard/tab-nav";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";

const tabs = [
    { id: "invoice", label: "📄 Import facture", disabled: true, badge: "Bientôt" },
    { id: "ean", label: "📱 Scan EAN", disabled: true, badge: "Bientôt" },
    { id: "manual", label: "✏️ Saisie manuelle" },
];

export default function NewProductPage() {
    const router = useRouter();
    const { merchant } = useMerchant();
    const { createProduct } = useProducts(merchant?.id);
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("manual");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (values: { name: string; description: string; ean: string; category: string; price: number; initial_quantity: number }) => {
        setIsLoading(true);
        try {
            await createProduct({
                name: values.name,
                description: values.description || undefined,
                ean: values.ean || undefined,
                category: values.category || undefined,
                price: values.price,
                initial_quantity: values.initial_quantity,
            });
            toast("Produit créé");
            router.push("/dashboard/products");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Nouveau"
                titleAccent="produit"
                action={
                    <Link href="/dashboard/products" className="text-sm text-gray-400 hover:text-gray-600 no-underline">
                        ← Retour
                    </Link>
                }
            />

            <TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === "manual" && (
                <ProductForm
                    onSubmit={handleSubmit}
                    submitLabel="Créer le produit"
                    isLoading={isLoading}
                />
            )}

            {activeTab === "invoice" && (
                <div className="animate-fade-up stagger-3 flex flex-col items-center rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center" style={{ background: "#F5F6FA" }}>
                    <p className="text-3xl mb-3">📄</p>
                    <p className="text-sm font-medium text-gray-400">Import facture — Disponible prochainement</p>
                    <p className="text-xs text-gray-300 mt-1">L&apos;IA analysera vos factures fournisseur automatiquement</p>
                </div>
            )}

            {activeTab === "ean" && (
                <div className="animate-fade-up stagger-3 flex flex-col items-center rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center" style={{ background: "#F5F6FA" }}>
                    <p className="text-3xl mb-3">📱</p>
                    <p className="text-sm font-medium text-gray-400">Scan EAN — Disponible prochainement</p>
                    <p className="text-xs text-gray-300 mt-1">Scannez le code-barres pour remplir automatiquement</p>
                </div>
            )}
        </>
    );
}

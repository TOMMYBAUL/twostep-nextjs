"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
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
    return (
        <Suspense fallback={null}>
            <NewProductInner />
        </Suspense>
    );
}

function NewProductInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const eanParam = searchParams.get("ean") ?? "";
    const prefill = searchParams.get("prefill") === "1";
    const ref = searchParams.get("ref");

    const { merchant } = useMerchant();
    const { createProduct } = useProducts(merchant?.id);
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("manual");
    const [isLoading, setIsLoading] = useState(false);
    const [initial, setInitial] = useState<{
        name: string; description: string; ean: string; category: string; price: string; initialQuantity: string; photoUrl?: string | null;
    } | null>(() =>
        eanParam
            ? { name: "", description: "", ean: eanParam, category: "", price: "", initialQuantity: "0" }
            : null,
    );
    const [enriching, setEnriching] = useState(false);

    useEffect(() => {
        if (!prefill || !ref || !merchant?.id) return;
        setEnriching(true);
        (async () => {
            try {
                const res = await fetch(`/api/products/by-ean?ean=${encodeURIComponent(eanParam)}&merchant_id=${merchant.id}`);
                if (!res.ok) return;
                const data = await res.json() as {
                    status: string;
                    product?: { name?: string; canonical_name?: string; brand?: string; category?: string; photo_url?: string; photo_processed_url?: string };
                };
                if (data.status === "global_hit" && data.product) {
                    setInitial({
                        ean: eanParam,
                        name: data.product.canonical_name ?? data.product.name ?? "",
                        description: "",
                        category: data.product.category ?? "",
                        price: "",
                        initialQuantity: "0",
                        photoUrl: data.product.photo_processed_url ?? data.product.photo_url ?? null,
                    });
                }
            } catch {
                // non-critical — user can still fill manually
            } finally {
                setEnriching(false);
            }
        })();
    }, [prefill, ref, eanParam, merchant?.id]);

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
            router.push("/dashboard/stock/mon-stock");
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
                    <Link href="/dashboard/stock/mon-stock" className="text-sm text-tertiary hover:text-secondary no-underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                        ← Retour
                    </Link>
                }
            />

            {enriching && (
                <p className="animate-fade-up stagger-2 mb-3 rounded-xl bg-brand-primary/10 px-4 py-2.5 text-xs font-medium text-brand-secondary">
                    Enrichissement du produit depuis le référentiel Two-Step…
                </p>
            )}

            <TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === "manual" && (
                <ProductForm
                    key={initial?.ean ?? "empty"}
                    initialValues={initial ?? undefined}
                    onSubmit={handleSubmit}
                    submitLabel="Créer le produit"
                    isLoading={isLoading}
                />
            )}

            {activeTab === "invoice" && (
                <div className="animate-fade-up stagger-3 flex flex-col items-center rounded-2xl border-2 border-dashed border-secondary bg-secondary py-16 text-center">
                    <p className="text-3xl mb-3">📄</p>
                    <p className="text-sm font-medium text-tertiary">Import facture — Disponible prochainement</p>
                    <p className="text-xs text-tertiary mt-1">L&apos;IA analysera vos factures fournisseur automatiquement</p>
                </div>
            )}

            {activeTab === "ean" && (
                <div className="animate-fade-up stagger-3 flex flex-col items-center rounded-2xl border-2 border-dashed border-secondary bg-secondary py-16 text-center">
                    <p className="text-3xl mb-3">📱</p>
                    <p className="text-sm font-medium text-tertiary">Scan EAN — Disponible prochainement</p>
                    <p className="text-xs text-tertiary mt-1">Scannez le code-barres pour remplir automatiquement</p>
                </div>
            )}
        </>
    );
}

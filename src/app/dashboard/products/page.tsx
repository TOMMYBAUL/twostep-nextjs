"use client";

import Link from "next/link";
import { useState } from "react";
import { ImagePlus, Plus, XClose } from "@untitledui/icons";
import { EmptyState } from "@/components/dashboard/empty-state";
import { MetricCard } from "@/components/dashboard/metric-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductRow } from "@/components/dashboard/product-row";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";
import { useIncompleteProducts } from "@/hooks/use-incomplete-products";

export default function ProductsPage() {
    const { merchant } = useMerchant();
    const { products, loading } = useProducts(merchant?.id);
    const { products: incompleteProducts, count: incompleteCount, refetch: refetchIncomplete } = useIncompleteProducts(merchant?.id);
    const { toast } = useToast();
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState<"catalogue" | "incomplete">("catalogue");

    const filtered = products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
    );

    const totalProducts = products.length;
    const inStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) > 0).length;
    const lowStock = products.filter((p) => {
        const q = p.stock?.[0]?.quantity ?? 0;
        return q > 0 && q <= 5;
    }).length;
    const outOfStock = products.filter((p) => (p.stock?.[0]?.quantity ?? 0) === 0).length;

    return (
        <>
            <OnboardingChecklist merchant={merchant} />
            <PageHeader
                storeName={merchant?.name}
                title="Mes"
                titleAccent="produits"
                action={
                    <Link href="/dashboard/products/new" className="btn-ts no-underline">
                        + Ajouter un produit
                    </Link>
                }
            />

            {/* Tabs */}
            <div className="animate-fade-up stagger-1 mb-6 flex gap-1 rounded-xl bg-gray-100 p-1">
                <button
                    onClick={() => setActiveTab("catalogue")}
                    className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${activeTab === "catalogue" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                >
                    Catalogue
                </button>
                <button
                    onClick={() => setActiveTab("incomplete")}
                    className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${activeTab === "incomplete" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                >
                    À compléter
                    {incompleteCount > 0 && (
                        <span className="ml-1.5 inline-flex size-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                            {incompleteCount}
                        </span>
                    )}
                </button>
            </div>

            {activeTab === "catalogue" ? (
                <>
                    {/* Metrics */}
                    <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                        <MetricCard label="Total produits" value={totalProducts} staggerIndex={0} />
                        <MetricCard label="En stock" value={inStock} staggerIndex={1} />
                        <MetricCard label="Stock bas" value={lowStock} variant="warn" staggerIndex={2} />
                        <MetricCard label="Ruptures" value={outOfStock} variant="danger" staggerIndex={3} />
                    </div>

                    {/* Search */}
                    <div className="animate-fade-up stagger-5 mb-4 flex items-center justify-between">
                        <input
                            type="text"
                            className="search-ts"
                            placeholder="Rechercher un produit..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {/* Product list */}
                    {loading ? (
                        <div className="flex flex-col gap-1.5">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="animate-pulse rounded-xl bg-white px-4 py-5" />
                            ))}
                        </div>
                    ) : filtered.length === 0 && search === "" ? (
                        <EmptyState
                            icon="📦"
                            title="Aucun produit encore"
                            description="Ajoutez votre premier produit pour commencer à le rendre visible."
                            action={
                                <Link href="/dashboard/products/new" className="btn-ts no-underline">
                                    Ajouter mon premier produit
                                </Link>
                            }
                        />
                    ) : filtered.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-400">Aucun résultat pour &quot;{search}&quot;</p>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {filtered.map((product, i) => (
                                <ProductRow
                                    key={product.id}
                                    id={product.id}
                                    name={product.name}
                                    category={product.category}
                                    price={product.price}
                                    stockQuantity={product.stock?.[0]?.quantity ?? 0}
                                    photoUrl={product.photo_processed_url ?? product.photo_url}
                                    staggerIndex={i}
                                />
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <IncompleteProductsTab
                    products={incompleteProducts}
                    merchantId={merchant?.id}
                    onComplete={() => { refetchIncomplete(); toast("Produit publié"); }}
                />
            )}
        </>
    );
}

/* ── Incomplete products tab ── */

function IncompleteProductsTab({ products, merchantId, onComplete }: {
    products: { id: string; name: string; category: string | null; price: number | null; photo_url: string | null }[];
    merchantId: string | undefined;
    onComplete: () => void;
}) {
    const [editingId, setEditingId] = useState<string | null>(null);

    if (products.length === 0) {
        return (
            <EmptyState
                icon="✅"
                title="Tout est à jour"
                description="Aucun produit en attente de complétion. Les produits sans code EAN apparaîtront ici."
            />
        );
    }

    return (
        <div className="space-y-3">
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                <p className="font-semibold">Ces produits ne sont pas visibles par les clients</p>
                <p className="mt-0.5">Ils n'ont pas de code EAN. Complétez-les manuellement pour les publier.</p>
            </div>

            {products.map((product) => (
                editingId === product.id ? (
                    <IncompleteProductForm
                        key={product.id}
                        product={product}
                        merchantId={merchantId}
                        onCancel={() => setEditingId(null)}
                        onComplete={() => { setEditingId(null); onComplete(); }}
                    />
                ) : (
                    <div key={product.id} className="flex items-center gap-4 rounded-xl bg-white px-5 py-4">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                            {product.photo_url ? (
                                <img src={product.photo_url} alt="" className="size-full rounded-xl object-cover" />
                            ) : (
                                <ImagePlus className="size-5 text-gray-300" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                            <p className="text-xs text-gray-400">{product.category ?? "Sans catégorie"} · Pas de EAN</p>
                        </div>
                        <button
                            onClick={() => setEditingId(product.id)}
                            className="btn-ts text-xs"
                        >
                            Compléter
                        </button>
                    </div>
                )
            ))}
        </div>
    );
}

/* ── Form to complete an incomplete product ── */

function IncompleteProductForm({ product, merchantId, onCancel, onComplete }: {
    product: { id: string; name: string };
    merchantId: string | undefined;
    onCancel: () => void;
    onComplete: () => void;
}) {
    const [name, setName] = useState(product.name);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [isOneSize, setIsOneSize] = useState(false);
    const [sizes, setSizes] = useState<{ size: string; quantity: number }[]>([]);
    const [newSize, setNewSize] = useState("");
    const [newQty, setNewQty] = useState("1");
    const [oneSizeQty, setOneSizeQty] = useState("1");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    const addSize = () => {
        if (!newSize.trim()) return;
        if (sizes.some((s) => s.size === newSize.trim())) return;
        setSizes([...sizes, { size: newSize.trim(), quantity: parseInt(newQty) || 1 }]);
        setNewSize("");
        setNewQty("1");
    };

    const removeSize = (size: string) => {
        setSizes(sizes.filter((s) => s.size !== size));
    };

    const handleSubmit = async () => {
        if (!name.trim() || (!isOneSize && sizes.length === 0)) return;
        setIsSubmitting(true);
        try {
            // Upload photo if provided
            if (photoFile && merchantId) {
                setUploading(true);
                const form = new FormData();
                form.append("file", photoFile);
                form.append("product_id", product.id);
                await fetch("/api/images/upload", { method: "POST", body: form });
                setUploading(false);
            }

            // Update product with name, available_sizes, visible=true
            const finalSizes = isOneSize ? [] : sizes;
            const totalStock = isOneSize ? (parseInt(oneSizeQty) || 1) : sizes.reduce((sum, s) => sum + s.quantity, 0);
            await fetch(`/api/products/${product.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    available_sizes: finalSizes,
                    visible: true,
                }),
            });

            // Update stock
            await fetch("/api/stock", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: product.id, quantity: totalStock }),
            });

            onComplete();
        } catch {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="rounded-xl bg-white px-5 py-5 space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Compléter le produit</p>
                <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                    <XClose className="size-4" />
                </button>
            </div>

            {/* Photo */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Photo</label>
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => document.getElementById(`photo-${product.id}`)?.click()}
                        className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 transition hover:border-gray-300"
                    >
                        {photoPreview ? (
                            <img src={photoPreview} alt="" className="size-full object-cover" />
                        ) : (
                            <ImagePlus className="size-5 text-gray-400" />
                        )}
                    </button>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                        {uploading ? "Upload en cours..." : "Fond clair, produit centré, lumière naturelle. L'arrière-plan sera automatiquement nettoyé."}
                    </p>
                </div>
                <input
                    id={`photo-${product.id}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            setPhotoFile(file);
                            setPhotoPreview(URL.createObjectURL(file));
                        }
                    }}
                />
            </div>

            {/* Name */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nom du produit</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="search-ts w-full" />
            </div>

            {/* One size toggle */}
            <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Tailles</label>
                <button
                    type="button"
                    onClick={() => setIsOneSize(!isOneSize)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm transition ${isOneSize ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                >
                    <span>Taille unique</span>
                    <span className={`flex size-5 items-center justify-center rounded-full text-xs font-bold transition ${isOneSize ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400"}`}>
                        {isOneSize ? "✓" : ""}
                    </span>
                </button>
                <p className="mt-1 text-[11px] text-gray-400">Montre, bijou, bougie, déco... tout ce qui n'a pas de taille</p>
            </div>

            {/* Sizes or quantity */}
            {isOneSize ? (
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Quantité en stock</label>
                    <input
                        type="number"
                        min="1"
                        value={oneSizeQty}
                        onChange={(e) => setOneSizeQty(e.target.value)}
                        className="search-ts w-full"
                        placeholder="Quantité"
                    />
                </div>
            ) : (
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Tailles disponibles</label>

                    {sizes.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                            {sizes.map((s) => (
                                <span key={s.size} className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
                                    {s.size} <span className="text-gray-400">({s.quantity})</span>
                                    <button type="button" onClick={() => removeSize(s.size)} className="text-gray-400 hover:text-red-500">
                                        <XClose className="size-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newSize}
                            onChange={(e) => setNewSize(e.target.value)}
                            className="search-ts flex-1"
                            placeholder="Taille (ex: 42, M, XL)"
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSize())}
                        />
                        <input
                            type="number"
                            min="1"
                            value={newQty}
                            onChange={(e) => setNewQty(e.target.value)}
                            className="search-ts w-20"
                            placeholder="Qté"
                        />
                        <button type="button" onClick={addSize} className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 text-xs font-medium text-gray-600 hover:bg-gray-200 transition">
                            <Plus className="size-3.5" /> Ajouter
                        </button>
                    </div>
                </div>
            )}

            {/* Submit */}
            <button
                onClick={handleSubmit}
                disabled={isSubmitting || !name.trim() || (!isOneSize && sizes.length === 0)}
                className="btn-ts w-full"
            >
                {isSubmitting ? "Publication..." : "Publier le produit"}
            </button>
        </div>
    );
}

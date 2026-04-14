"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ImagePlus, Plus, Upload01, XClose } from "@untitledui/icons";
import { EmptyState } from "@/components/dashboard/empty-state";
import { MetricCard } from "@/components/dashboard/metric-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductRow } from "@/components/dashboard/product-row";
import { StockBadge } from "@/components/dashboard/stock-badge";
import { StockTabs } from "@/components/dashboard/stock-tabs";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";
import { useIncompleteProducts } from "@/hooks/use-incomplete-products";

export default function ProductsPage() {
    const { merchant } = useMerchant();
    const { products, loading, updateStock, refetch: refetchProducts } = useProducts(merchant?.id);
    const { products: incompleteProducts, count: incompleteCount, refetch: refetchIncomplete } = useIncompleteProducts(merchant?.id);
    const { toast } = useToast();
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState<"catalogue" | "incomplete">("catalogue");
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const recalRef = useRef<HTMLInputElement>(null);

    const handleCatalogImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = ""; // reset for re-upload

        toast("Import en cours...");
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/catalog/import", { method: "POST", body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast(`Stock recalé : ${data.products_updated} mis à jour, ${data.products_created} créés`);
            await refetchProducts();
            refetchIncomplete();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur d'import", "error");
        }
    };

    const handleDelta = async (productId: string, delta: number) => {
        setUpdatingId(productId);
        try {
            await updateStock(productId, delta);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setUpdatingId(null);
        }
    };

    const handleAbsolute = async (productId: string, value: string) => {
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 0) return;
        setUpdatingId(productId);
        try {
            await updateStock(productId, undefined, qty);
            toast("Stock mis à jour");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setUpdatingId(null);
        }
    };

    const filtered = products.filter((p) =>
        (p.canonical_name ?? p.name).toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase()),
    );

    const hasPOS = !!merchant?.pos_type;
    const totalProducts = products.length;
    // stock can be an object {quantity} or array [{quantity}] depending on Supabase join
    const getQty = (p: any): number => {
        const s = p.stock;
        if (!s) return 0;
        if (Array.isArray(s)) return s[0]?.quantity ?? 0;
        return s.quantity ?? 0;
    };
    const inStock = products.filter((p) => getQty(p) > 0).length;
    const lowStock = products.filter((p) => {
        const q = getQty(p);
        return q > 0 && q <= 5;
    }).length;
    const outOfStock = products.filter((p) => getQty(p) === 0).length;

    return (
        <>
            <OnboardingChecklist merchant={merchant} />
            <PageHeader
                storeName={merchant?.name}
                title="Mon"
                titleAccent="stock"
                action={
                    <Link href="/dashboard/products/new" className="btn-ts no-underline">
                        + Ajouter un produit
                    </Link>
                }
            />

            <StockTabs />

            {/* Stock management tip — only if no POS connected */}
            {merchant && !merchant.pos_type && products.length > 0 && (
                <div className="animate-fade-up stagger-05 mb-4 rounded-2xl border border-secondary bg-secondary p-4">
                    <p className="mb-2 text-sm font-semibold text-primary">Gestion simplifiée</p>
                    <p className="text-sm text-tertiary">
                        Vos produits sont marqués <strong className="text-secondary">disponibles</strong> ou <strong className="text-secondary">indisponibles</strong>.
                        Le soir, allez dans l'onglet <strong className="text-secondary">Ventes</strong> pour mettre à jour en 15 secondes.
                    </p>
                </div>
            )}

            {/* Quick actions */}
            <div className="animate-fade-up stagger-05 mb-4 flex flex-wrap gap-2">
                <Link
                    href="/dashboard/recap"
                    className="inline-flex items-center gap-2 rounded-xl border border-brand bg-brand-secondary px-4 py-2.5 text-sm font-medium text-brand-secondary no-underline hover:bg-brand-primary_alt"
                >
                    {hasPOS ? "Voir mes stats" : "Mettre à jour"}
                </Link>
                <button
                    type="button"
                    onClick={() => recalRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border border-secondary bg-primary px-4 py-2.5 text-sm font-medium text-secondary hover:bg-primary_hover"
                >
                    <Upload01 className="size-4" /> Réimporter mon catalogue
                </button>
                <input
                    ref={recalRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleCatalogImport}
                />
            </div>

            {/* Tabs */}
            <div className="animate-fade-up stagger-1 mb-6 flex gap-1 rounded-xl bg-secondary p-1">
                <button
                    type="button"
                    onClick={() => setActiveTab("catalogue")}
                    className={`flex-1 rounded-lg px-4 py-2 min-h-[44px] text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${activeTab === "catalogue" ? "bg-primary text-primary shadow-sm" : "text-tertiary"}`}
                >
                    Catalogue
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("incomplete")}
                    className={`flex-1 rounded-lg px-4 py-2 min-h-[44px] text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${activeTab === "incomplete" ? "bg-primary text-primary shadow-sm" : "text-tertiary"}`}
                >
                    À compléter
                    {incompleteCount > 0 && (
                        <span className="ml-1.5 inline-flex size-5 items-center justify-center rounded-full bg-warning-solid text-[10px] font-bold text-white">
                            {incompleteCount}
                        </span>
                    )}
                </button>
            </div>

            {activeTab === "catalogue" ? (
                <>
                    {/* Metrics */}
                    <div className={`mb-8 grid grid-cols-2 gap-3 ${hasPOS ? "md:grid-cols-4" : "md:grid-cols-3"} md:gap-4`}>
                        <MetricCard label="Total produits" value={totalProducts} staggerIndex={0} />
                        {hasPOS ? (
                            <>
                                <MetricCard label="En stock" value={inStock} staggerIndex={1} />
                                <MetricCard label="Stock bas" value={lowStock} variant="warn" staggerIndex={2} />
                                <MetricCard label="Ruptures" value={outOfStock} variant="danger" staggerIndex={3} />
                            </>
                        ) : (
                            <>
                                <MetricCard label="Disponibles" value={inStock} staggerIndex={1} />
                                <MetricCard label="Indisponibles" value={outOfStock} variant={outOfStock > 0 ? "danger" : undefined} staggerIndex={2} />
                            </>
                        )}
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
                                <div key={i} className="animate-pulse rounded-xl bg-primary px-4 py-5" />
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
                        <p className="py-8 text-center text-sm text-tertiary">Aucun résultat pour &quot;{search}&quot;</p>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {filtered.map((product, i) => {
                                const qty = getQty(product);
                                return (
                                    <ProductRow
                                        key={product.id}
                                        id={product.id}
                                        name={product.canonical_name ?? product.name}
                                        category={product.category}
                                        price={product.price}
                                        stockQuantity={qty}
                                        photoUrl={product.photo_processed_url ?? product.photo_url}
                                        staggerIndex={i}
                                        sizes={product.available_sizes}
                                        hasPOS={hasPOS}
                                        stockControls={hasPOS ? (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    aria-label="Diminuer le stock"
                                                    onClick={() => handleDelta(product.id, -1)}
                                                    disabled={updatingId === product.id || qty <= 0}
                                                    className="flex size-8 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-secondary hover:bg-secondary_hover disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                                >
                                                    −
                                                </button>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    defaultValue={qty}
                                                    key={`${product.id}-${qty}`}
                                                    onBlur={(e) => handleAbsolute(product.id, e.target.value)}
                                                    className="w-14 rounded-lg bg-secondary px-2 py-1.5 text-center text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                                                />
                                                <button
                                                    type="button"
                                                    aria-label="Augmenter le stock"
                                                    onClick={() => handleDelta(product.id, 1)}
                                                    disabled={updatingId === product.id}
                                                    className="flex size-8 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-secondary hover:bg-secondary_hover disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                                >
                                                    +
                                                </button>
                                                <StockBadge quantity={qty} hasPOS />
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => handleAbsolute(product.id, qty > 0 ? "0" : "1")}
                                                disabled={updatingId === product.id}
                                                className="shrink-0"
                                            >
                                                <StockBadge quantity={qty} hasPOS={false} />
                                            </button>
                                        )}
                                    />
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (
                <IncompleteProductsTab
                    products={incompleteProducts}
                    merchantId={merchant?.id}
                    hasPOS={hasPOS}
                    onComplete={() => { refetchIncomplete(); toast("Produit publié"); }}
                />
            )}
        </>
    );
}

/* ── Incomplete products tab ── */

function IncompleteProductsTab({ products, merchantId, hasPOS, onComplete }: {
    products: { id: string; name: string; category: string | null; price: number | null; photo_url: string | null }[];
    merchantId: string | undefined;
    hasPOS: boolean;
    onComplete: () => void;
}) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [publishing, setPublishing] = useState<string | null>(null);
    const [publishingCount, setPublishingCount] = useState<{ done: number; total: number } | null>(null);
    const { toast } = useToast();

    // Non-POS: quick publish (just set visible: true, no EAN needed)
    const handleQuickPublish = async (productId: string) => {
        setPublishing(productId);
        try {
            await fetch(`/api/products/${productId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ visible: true }),
            });
            // Set stock to 1 (available) if not already
            await fetch("/api/stock", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: productId, quantity: 1 }),
            });
            onComplete();
        } catch {
            toast("Erreur de publication", "error");
        } finally {
            setPublishing(null);
        }
    };

    if (products.length === 0) {
        return (
            <EmptyState
                icon="✅"
                title="Tout est à jour"
                description="Tous vos produits sont visibles par les clients."
            />
        );
    }

    return (
        <div className="space-y-3">
            <div className="rounded-xl bg-warning-secondary px-4 py-3 text-xs text-warning-primary">
                <p className="font-semibold">Ces produits ne sont pas encore visibles par les clients</p>
                <p className="mt-0.5">
                    {hasPOS
                        ? "Complétez les informations manquantes pour les publier."
                        : "Publiez-les en un clic ou complétez leurs informations."
                    }
                </p>
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
                    <div key={product.id} className="flex items-center gap-4 rounded-xl bg-primary px-5 py-4">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary">
                            {product.photo_url ? (
                                <img src={product.photo_url} alt="" className="size-full rounded-xl object-cover" />
                            ) : (
                                <ImagePlus aria-hidden="true" className="size-5 text-tertiary" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-primary truncate">{product.name}</p>
                            <p className="text-xs text-tertiary">
                                {product.category ?? "Sans catégorie"}
                                {!product.photo_url && " · Pas de photo"}
                            </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            {!hasPOS && (
                                <button
                                    type="button"
                                    onClick={() => handleQuickPublish(product.id)}
                                    disabled={publishing === product.id}
                                    className="rounded-lg bg-brand-solid px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-solid_hover disabled:opacity-50"
                                >
                                    {publishing === product.id ? "..." : "Publier"}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setEditingId(product.id)}
                                className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-secondary_hover"
                            >
                                Modifier
                            </button>
                        </div>
                    </div>
                )
            ))}

            {/* Bulk publish for non-POS */}
            {!hasPOS && products.length > 1 && (
                <button
                    type="button"
                    disabled={publishingCount !== null}
                    onClick={async () => {
                        setPublishingCount({ done: 0, total: products.length });
                        let done = 0;
                        await Promise.allSettled(
                            products.map(async (p) => {
                                await handleQuickPublish(p.id);
                                done += 1;
                                setPublishingCount({ done, total: products.length });
                            })
                        );
                        setPublishingCount(null);
                    }}
                    className="w-full rounded-xl border border-brand bg-brand-secondary px-4 py-3 text-sm font-semibold text-brand-secondary transition hover:bg-brand-primary_alt disabled:opacity-60"
                >
                    {publishingCount !== null
                        ? `${publishingCount.done}/${publishingCount.total} publiés...`
                        : `Tout publier (${products.length} produits)`
                    }
                </button>
            )}
        </div>
    );
}

/* ── Form to complete an incomplete product ── */

function IncompleteProductForm({ product, merchantId, onCancel, onComplete }: {
    product: { id: string; name: string; photo_url?: string | null };
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
    const [photoError, setPhotoError] = useState<string | null>(null);

    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

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
        <div className="rounded-xl bg-primary px-5 py-5 space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-primary">Compléter le produit</p>
                <button type="button" onClick={onCancel} aria-label="Fermer" className="text-tertiary hover:text-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                    <XClose aria-hidden="true" className="size-4" />
                </button>
            </div>

            {/* Photo */}
            <div>
                <label className="mb-1 block text-sm font-medium text-secondary">Photo</label>
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => document.getElementById(`photo-${product.id}`)?.click()}
                        className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-secondary bg-secondary transition hover:border-tertiary"
                    >
                        {photoPreview ? (
                            <img src={photoPreview} alt="" className="size-full object-cover" />
                        ) : (
                            <ImagePlus aria-hidden="true" className="size-5 text-tertiary" />
                        )}
                    </button>
                    <p className="text-[11px] text-tertiary leading-relaxed">
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
                        if (!file) return;
                        if (!ALLOWED_TYPES.includes(file.type)) {
                            setPhotoError("Format accepté : JPEG, PNG ou WebP");
                            return;
                        }
                        if (file.size > MAX_FILE_SIZE) {
                            setPhotoError("La photo ne doit pas dépasser 5 Mo");
                            return;
                        }
                        setPhotoError(null);
                        setPhotoFile(file);
                        setPhotoPreview(URL.createObjectURL(file));
                    }}
                />
                {photoError && <p className="mt-1 text-xs text-error-primary">{photoError}</p>}
                {!photoFile && !product.photo_url && (
                    <p className="mt-1 text-xs text-warning-primary">Sans photo, votre produit sera moins attractif</p>
                )}
            </div>

            {/* Name */}
            <div>
                <label className="mb-1 block text-sm font-medium text-secondary">Nom du produit</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="search-ts w-full" />
            </div>

            {/* One size toggle */}
            <div>
                <label className="mb-2 block text-sm font-medium text-secondary">Tailles</label>
                <button
                    type="button"
                    onClick={() => setIsOneSize(!isOneSize)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm transition ${isOneSize ? "border-blue-200 bg-blue-50 text-blue-700" : "border-secondary bg-secondary text-secondary hover:bg-secondary"}`}
                >
                    <span>Taille unique</span>
                    <span className={`flex size-5 items-center justify-center rounded-full text-xs font-bold transition ${isOneSize ? "bg-brand-solid text-white" : "bg-tertiary text-tertiary"}`}>
                        {isOneSize ? "✓" : ""}
                    </span>
                </button>
                <p className="mt-1 text-[11px] text-tertiary">Montre, bijou, bougie, déco... tout ce qui n'a pas de taille</p>
            </div>

            {/* Sizes or quantity */}
            {isOneSize ? (
                <div>
                    <label className="mb-1 block text-sm font-medium text-secondary">Quantité en stock</label>
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
                    <label className="mb-2 block text-sm font-medium text-secondary">Tailles disponibles</label>

                    {sizes.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                            {sizes.map((s) => (
                                <span key={s.size} className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary">
                                    {s.size} <span className="text-tertiary">({s.quantity})</span>
                                    <button type="button" aria-label={`Supprimer taille ${s.size}`} onClick={() => removeSize(s.size)} className="text-tertiary hover:text-error-primary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                                        <XClose aria-hidden="true" className="size-3" />
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
                        <button type="button" onClick={addSize} className="flex items-center gap-1 rounded-lg bg-secondary px-3 text-xs font-medium text-secondary hover:bg-secondary_hover transition">
                            <Plus aria-hidden="true" className="size-3.5" /> Ajouter
                        </button>
                    </div>
                </div>
            )}

            {/* Submit */}
            <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !name.trim() || (!isOneSize && sizes.length === 0)}
                className="btn-ts w-full"
            >
                {isSubmitting ? "Publication..." : "Publier le produit"}
            </button>
        </div>
    );
}

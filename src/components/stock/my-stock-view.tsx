"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus, Plus, QrCode01, Upload01, XClose } from "@untitledui/icons";
import { BarcodeScanModal, type ScanResult } from "@/components/stock/barcode-scan-modal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductRow } from "@/components/dashboard/product-row";
import { StockBadge } from "@/components/dashboard/stock-badge";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useProducts } from "@/hooks/use-products";
import { useIncompleteProducts } from "@/hooks/use-incomplete-products";

type StockFilter = "all" | "ruptures" | "incomplete" | { kind: "category"; value: string };

function isCategoryFilter(f: StockFilter): f is { kind: "category"; value: string } {
    return typeof f === "object" && f.kind === "category";
}

export function MyStockView() {
    const router = useRouter();
    const { merchant } = useMerchant();
    const { products, loading, updateStock, refetch: refetchProducts } = useProducts(merchant?.id);
    const { products: incompleteProducts, count: incompleteCount, refetch: refetchIncomplete } = useIncompleteProducts(merchant?.id);
    const { toast } = useToast();
    const [search, setSearch] = useState("");
    const [activeFilter, setActiveFilter] = useState<StockFilter>("all");
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const recalRef = useRef<HTMLInputElement>(null);

    const handleScanResult = (result: ScanResult) => {
        if (result.status === "merchant_hit" && result.product) {
            setScanOpen(false);
            const slug = (result.product as { slug?: string; id: string }).slug;
            const id = (result.product as { id: string }).id;
            router.push(`/dashboard/products/${slug ?? id}/edit`);
            return;
        }
        if (result.status === "global_hit") {
            toast("Produit reconnu — l'ajouter à ton stock ?", {
                action: {
                    label: "Ajouter",
                    onClick: () => {
                        setScanOpen(false);
                        const ref = (result.product as { id?: string } | undefined)?.id;
                        router.push(`/dashboard/products/new?ean=${encodeURIComponent(result.ean)}&prefill=1${ref ? `&ref=${ref}` : ""}`);
                    },
                },
            });
            return;
        }
        toast(`EAN ${result.ean} inconnu`, {
            type: "error",
            action: {
                label: "Créer",
                onClick: () => {
                    setScanOpen(false);
                    router.push(`/dashboard/products/new?ean=${encodeURIComponent(result.ean)}`);
                },
            },
        });
    };

    const handleCatalogImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = ""; // reset for re-upload

        setImporting(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/catalog/import", { method: "POST", body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast(`${data.products_created} produits créés, ${data.products_updated} mis à jour — les photos s'enrichissent en arrière-plan`);
            await refetchProducts();
            refetchIncomplete();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur d'import", "error");
        } finally {
            setImporting(false);
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

    // Non-POS: flip a single size between available (1) and rupture (0) by
    // rewriting the product's available_sizes array. The total stock is
    // recomputed and synced so the consumer view stays consistent. The user
    // gets a 5s undo window via the toast action.
    const applySizes = async (productId: string, sizes: { size: string; quantity: number }[]) => {
        await fetch(`/api/products/${productId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ available_sizes: sizes }),
        });
        const totalQty = sizes.reduce((sum, v) => sum + v.quantity, 0);
        await updateStock(productId, undefined, totalQty);
        await refetchProducts();
    };

    const handleToggleVariant = async (productId: string, sizeLabel: string) => {
        const product = products.find((p) => p.id === productId);
        if (!product) return;
        const previous = (product.available_sizes ?? []) as { size: string; quantity: number }[];
        const next = previous.map((v) =>
            v.size === sizeLabel ? { ...v, quantity: v.quantity > 0 ? 0 : 1 } : v,
        );
        const nowAvailable = next.find((v) => v.size === sizeLabel)?.quantity ?? 0;

        setUpdatingId(productId);
        try {
            await applySizes(productId, next);
            toast(
                nowAvailable > 0
                    ? `${sizeLabel} remis en stock`
                    : `${sizeLabel} passé en rupture`,
                {
                    action: {
                        label: "Annuler",
                        onClick: () => {
                            applySizes(productId, previous).catch(() => {
                                toast("Impossible d'annuler", "error");
                            });
                        },
                    },
                },
            );
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setUpdatingId(null);
        }
    };

    // stock can be an object {quantity} or array [{quantity}] depending on Supabase join
    const getQty = (p: any): number => {
        const s = p.stock;
        if (!s) return 0;
        if (Array.isArray(s)) return s[0]?.quantity ?? 0;
        return s.quantity ?? 0;
    };

    // Category counts (derived from current product list)
    const categoryCounts = products.reduce<Record<string, number>>((acc, p) => {
        const cat = p.category?.trim();
        if (cat) acc[cat] = (acc[cat] ?? 0) + 1;
        return acc;
    }, {});
    const categories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8); // cap to keep the chip bar usable

    const searchMatches = (p: (typeof products)[number]) =>
        (p.canonical_name ?? p.name).toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase());

    const filterMatches = (p: (typeof products)[number]) => {
        if (activeFilter === "all") return true;
        if (activeFilter === "ruptures") return getQty(p) === 0;
        if (isCategoryFilter(activeFilter)) return p.category === activeFilter.value;
        return true;
    };

    const filtered = products.filter((p) => searchMatches(p) && filterMatches(p));

    const hasPOS = !!merchant?.pos_type;
    const totalProducts = products.length;
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

            {/* Clôture du soir — non-POS uniquement */}
            {merchant && !merchant.pos_type && products.length > 0 && (
                <Link
                    href="/dashboard/stock/cloture"
                    className="animate-fade-up stagger-05 mb-4 flex items-center gap-3 rounded-2xl bg-brand-solid px-4 py-3.5 no-underline transition active:opacity-90"
                >
                    <span className="text-2xl" aria-hidden="true">🌙</span>
                    <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-white">Clôture du soir</p>
                        <p className="text-xs text-white/80">Marque les ruptures de la journée en 15 secondes</p>
                    </div>
                    <span className="text-white/80" aria-hidden="true">→</span>
                </Link>
            )}

            {/* Quick actions */}
            <div className="animate-fade-up stagger-05 mb-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => recalRef.current?.click()}
                    disabled={importing}
                    className="inline-flex items-center gap-2 rounded-xl border border-secondary bg-primary px-4 py-2.5 text-sm font-medium text-secondary hover:bg-primary_hover disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {importing ? (
                        <>
                            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Import en cours…
                        </>
                    ) : (
                        <>
                            <Upload01 className="size-4" /> Réimporter mon catalogue
                        </>
                    )}
                </button>
                <input
                    ref={recalRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleCatalogImport}
                />
            </div>

            {/* Résumé + filtres chips */}
            <div className="animate-fade-up stagger-1 mb-4">
                <p className="mb-3 text-sm font-medium text-tertiary">
                    <span className="font-semibold text-primary">{totalProducts}</span> {totalProducts <= 1 ? "produit" : "produits"}
                    {" · "}
                    <span className="font-semibold text-success-primary">{inStock}</span> {hasPOS ? "en stock" : "dispo"}
                    {" · "}
                    <span className={`font-semibold ${outOfStock > 0 ? "text-error-primary" : "text-primary"}`}>{outOfStock}</span> {hasPOS ? "rupture" : "indispo"}
                    {hasPOS && lowStock > 0 && (
                        <>
                            {" · "}
                            <span className="font-semibold text-warning-primary">{lowStock}</span> stock bas
                        </>
                    )}
                    {incompleteCount > 0 && (
                        <>
                            {" · "}
                            <span className="font-semibold text-warning-primary">{incompleteCount}</span> à compléter
                        </>
                    )}
                </p>

                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
                    <FilterChip
                        label="Tout"
                        count={totalProducts}
                        active={activeFilter === "all"}
                        onClick={() => setActiveFilter("all")}
                    />
                    {outOfStock > 0 && (
                        <FilterChip
                            label={hasPOS ? "Ruptures" : "Indispo"}
                            count={outOfStock}
                            active={activeFilter === "ruptures"}
                            tone="danger"
                            onClick={() => setActiveFilter("ruptures")}
                        />
                    )}
                    {incompleteCount > 0 && (
                        <FilterChip
                            label="À compléter"
                            count={incompleteCount}
                            active={activeFilter === "incomplete"}
                            tone="warn"
                            onClick={() => setActiveFilter("incomplete")}
                        />
                    )}
                    {categories.map(([cat, count]) => (
                        <FilterChip
                            key={cat}
                            label={cat}
                            count={count}
                            active={isCategoryFilter(activeFilter) && activeFilter.value === cat}
                            onClick={() => setActiveFilter({ kind: "category", value: cat })}
                        />
                    ))}
                </div>
            </div>

            {activeFilter !== "incomplete" ? (
                <>
                    {/* Search + scan */}
                    <div className="animate-fade-up stagger-5 mb-4 flex items-center gap-2">
                        <input
                            type="text"
                            className="search-ts flex-1"
                            placeholder="Rechercher un produit..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <button
                            type="button"
                            aria-label="Scanner un code-barres"
                            onClick={() => setScanOpen(true)}
                            disabled={!merchant?.id}
                            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-solid text-white shadow-sm transition active:opacity-90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            <QrCode01 aria-hidden="true" className="size-5" />
                        </button>
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
                                const productSizes = (product.available_sizes ?? []) as { size: string; quantity: number }[];
                                const hasVariants = productSizes.length > 0;
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
                                        expandedContent={hasVariants ? (
                                            <VariantPanel
                                                sizes={productSizes}
                                                hasPOS={hasPOS}
                                                isUpdating={updatingId === product.id}
                                                onToggle={(size) => handleToggleVariant(product.id, size)}
                                            />
                                        ) : undefined}
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

            {merchant?.id && (
                <BarcodeScanModal
                    open={scanOpen}
                    merchantId={merchant.id}
                    onClose={() => setScanOpen(false)}
                    onResult={handleScanResult}
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
                        setPhotoPreview((prev) => {
                            if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                            return URL.createObjectURL(file);
                        });
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

/* ── Variant panel (expanded row content) ── */

function VariantPanel({
    sizes,
    hasPOS,
    isUpdating,
    onToggle,
}: {
    sizes: { size: string; quantity: number }[];
    hasPOS: boolean;
    isUpdating: boolean;
    onToggle: (size: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {sizes.map((v) => {
                const available = v.quantity > 0;
                if (hasPOS) {
                    return (
                        <div
                            key={v.size}
                            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
                                available ? "bg-primary text-primary" : "bg-error-secondary text-error-primary"
                            }`}
                        >
                            <span className="font-semibold">{v.size}</span>
                            <span className="text-tertiary">{v.quantity}</span>
                        </div>
                    );
                }
                return (
                    <button
                        key={v.size}
                        type="button"
                        onClick={() => onToggle(v.size)}
                        disabled={isUpdating}
                        aria-pressed={available}
                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
                            available
                                ? "bg-success-secondary text-success-primary hover:bg-success-primary/20"
                                : "bg-error-secondary text-error-primary hover:bg-error-primary/20"
                        }`}
                    >
                        <span className="font-semibold">{v.size}</span>
                        <span>{available ? "· dispo" : "· rupture"}</span>
                    </button>
                );
            })}
        </div>
    );
}

/* ── Filter chip ── */

function FilterChip({
    label,
    count,
    active,
    tone,
    onClick,
}: {
    label: string;
    count: number;
    active: boolean;
    tone?: "danger" | "warn";
    onClick: () => void;
}) {
    const base = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none";
    const activeCls = tone === "danger"
        ? "bg-error-primary text-white"
        : tone === "warn"
            ? "bg-warning-primary text-white"
            : "bg-brand-solid text-white";
    const inactiveCls = tone === "danger"
        ? "bg-error-secondary text-error-primary hover:bg-error-primary/20"
        : tone === "warn"
            ? "bg-warning-secondary text-warning-primary hover:bg-warning-primary/20"
            : "bg-secondary text-secondary hover:bg-secondary_hover";

    return (
        <button type="button" onClick={onClick} aria-pressed={active} className={`${base} ${active ? activeCls : inactiveCls}`}>
            <span>{label}</span>
            <span className={`rounded-full px-1.5 text-[10px] font-semibold ${active ? "bg-white/20" : "bg-white/60"}`}>
                {count}
            </span>
        </button>
    );
}

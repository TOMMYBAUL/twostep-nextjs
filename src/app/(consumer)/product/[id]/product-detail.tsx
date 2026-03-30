"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Phone01, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { generateSlug } from "@/lib/slug";
import { HeartButton } from "../../components/heart-button";
import { useFavorites, useToggleFavorite } from "../../hooks/use-favorites";

interface SizeVariant {
    size: string;
    quantity: number;
}

interface ProductDetail {
    id: string;
    name: string;
    description: string | null;
    price: number;
    photo_url: string | null;
    photo_processed_url: string | null;
    ean: string | null;
    brand: string | null;
    category: string | null;
    size: string | null;
    merchant_id: string;
    stock: { quantity: number }[];
    promotions: { sale_price: number; ends_at: string | null }[];
    available_sizes: SizeVariant[];
    merchants?: {
        name: string;
        address: string;
        city: string;
        photo_url: string | null;
        phone?: string | null;
        opening_hours?: Record<string, { open: string; close: string }> | null;
    };
}

export default function ProductDetailClient() {
    const { id } = useParams<{ id: string }>();

    const { data: product, isLoading } = useQuery<ProductDetail>({
        queryKey: ["product", id],
        queryFn: async () => {
            const res = await fetch(`/api/products/${id}`);
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            return json.product;
        },
    });

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();

    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);
    const productUuid = product?.id;
    const isFavorite = productUuid ? favoriteIds.has(productUuid) : false;

    const stockData = product?.stock;
    const quantity = Array.isArray(stockData) ? (stockData[0]?.quantity ?? 0) : ((stockData as any)?.quantity ?? 0);
    const activePromo = product?.promotions?.find(
        (p) => !p.ends_at || new Date(p.ends_at) > new Date(),
    );
    const discount = activePromo ? Math.round(((product!.price - activePromo.sale_price) / product!.price) * 100) : 0;
    const displayPrice = activePromo ? activePromo.sale_price : product?.price;

    const availableSizes = product?.available_sizes ?? [];
    const hasSizes = availableSizes.length > 0;
    const [selectedSize, setSelectedSize] = useState<string | null>(null);

    const [sizeSheetOpen, setSizeSheetOpen] = useState(false);
    const [sizeChartOpen, setSizeChartOpen] = useState(false);
    const [contactSheetOpen, setContactSheetOpen] = useState(false);
    const [phoneCopied, setPhoneCopied] = useState(false);

    const [intentSent, setIntentSent] = useState(false);
    const [intentLoading, setIntentLoading] = useState(false);
    const [othersCount, setOthersCount] = useState(0);

    // Fetch how many others are interested in this product
    useEffect(() => {
        if (!product?.id) return;
        fetch(`/api/intents?product_id=${product.id}`)
            .then((r) => r.json())
            .then((d) => setOthersCount(d.count ?? 0))
            .catch(() => {});
    }, [product?.id, intentSent]);

    const handleIntent = async () => {
        if (intentLoading || intentSent || !product) return;
        if (hasSizes && !selectedSize) {
            setSizeSheetOpen(true);
            return;
        }
        setIntentLoading(true);
        try {
            const res = await fetch("/api/intents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    product_id: product.id,
                    merchant_id: product.merchant_id,
                    selected_size: selectedSize,
                }),
            });
            if (res.ok) {
                setIntentSent(true);
            }
        } catch {
            // Silently fail
        } finally {
            setIntentLoading(false);
        }
    };

    const shopSlug = product?.merchants?.name ? generateSlug(product.merchants.name, product.merchant_id) : null;

    const shop = product?.merchants;

    return (
        <div className="min-h-dvh bg-[#FFFFFF] md:flex md:min-h-screen md:flex-row">
            {/* ── Image zone ── */}
            <div className={`relative h-[300px] w-full overflow-hidden md:sticky md:top-0 md:h-screen md:w-1/2 ${product?.photo_processed_url ? "bg-white" : "bg-[#F8F9FC]"}`}>
                {(product?.photo_processed_url ?? product?.photo_url) ? (
                    <img src={product.photo_processed_url ?? product.photo_url ?? "/placeholder-product.svg"} alt={product?.name ?? ""} className={`h-full w-full object-center ${product?.photo_processed_url ? "object-contain p-4" : "object-cover"}`} />
                ) : (
                    <div className="flex h-full items-center justify-center">
                        {isLoading ? null : (
                            <span className="text-6xl font-bold text-[#E2E5F0]/30">
                                {product?.name?.charAt(0)}
                            </span>
                        )}
                    </div>
                )}

                {/* Back button — mobile only */}
                <button
                    type="button"
                    onClick={() => window.history.back()}
                    className="absolute left-4 top-4 flex size-8 items-center justify-center rounded-full md:hidden"
                    style={{ marginTop: "env(safe-area-inset-top)", background: "rgba(26,31,54,0.55)" }}
                    aria-label="Retour"
                >
                    <ArrowLeft className="size-4 text-white/90" />
                </button>

                {/* Heart button — mobile only */}
                <div className="absolute right-4 top-4 md:hidden" style={{ marginTop: "env(safe-area-inset-top)" }}>
                    <HeartButton
                        isFavorite={isFavorite}
                        onToggle={() => {
                            if (!productUuid) return;
                            if (isFavorite) remove.mutate(productUuid);
                            else add.mutate(productUuid);
                        }}
                        ariaLabel={`${isFavorite ? "Retirer" : "Ajouter"} ${product?.name ?? "produit"} des favoris`}
                        className="!size-8 !rounded-full [background:rgba(26,31,54,0.55)]"
                    />
                </div>

                {/* Dot indicator — mobile only */}
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 md:hidden">
                    <div className="h-[5px] w-[14px] rounded-[3px] bg-white" />
                </div>
            </div>

            {/* ── Info zone ── */}
            {isLoading ? (
                <div className="space-y-3 px-5 pt-6 md:w-1/2 md:px-10 md:pt-12">
                    <div className="h-3 w-32 animate-pulse rounded bg-[#F5F6FA]" />
                    <div className="h-6 w-48 animate-pulse rounded bg-[#F5F6FA]" />
                    <div className="h-4 w-24 animate-pulse rounded bg-[#F5F6FA]" />
                </div>
            ) : product ? (
                <div className="px-5 pb-40 pt-5 md:w-1/2 md:overflow-y-auto md:px-10 md:pb-12 md:pt-12">
                    {/* Brand · Category + stock tag */}
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[#8E96B0]">
                            {[product.brand, product.category].filter(Boolean).join(" · ")}
                        </span>
                        {quantity === 0 && (
                            <span className="rounded-md border-[0.5px] border-[rgba(66,104,255,0.25)] px-2 py-[2px] text-[10px] font-medium text-[#4268FF]" style={{ background: "rgba(66,104,255,0.12)" }}>
                                Épuisé en boutique
                            </span>
                        )}
                    </div>

                    {/* Product name */}
                    <h1 className="mb-2.5 text-xl font-bold leading-tight tracking-tight text-[#1A1F36] md:text-2xl">
                        {product.name}
                    </h1>

                    {/* Price line */}
                    <div className="mb-5 flex items-baseline gap-2.5">
                        <span className="text-base font-normal text-[#6B7799]">
                            {displayPrice?.toFixed(2)} €
                        </span>
                        {activePromo && (
                            <>
                                <span className="text-[13px] text-[#E2E5F0] line-through">
                                    {product.price.toFixed(2)} €
                                </span>
                                <span className="text-xs font-medium text-[#4268FF]">
                                    −{discount}%
                                </span>
                            </>
                        )}
                    </div>

                    {/* ── Size selector line ── */}
                    {hasSizes && (
                        <button
                            type="button"
                            onClick={() => setSizeSheetOpen(true)}
                            className="flex w-full items-center justify-between border-y-[0.5px] border-[#E2E5F0] py-4"
                        >
                            <span className="text-[13px] text-[#8E96B0]">
                                {/^\d/.test(availableSizes[0].size) ? "Pointure" : "Taille"}
                            </span>
                            <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#1A1F36]">
                                {selectedSize ?? "Sélectionner"}
                                <ChevronRight className="size-4 text-[#E2E5F0]" />
                            </span>
                        </button>
                    )}

                    {/* Size guide line — only when product has sizes */}
                    {hasSizes && (
                        <button
                            type="button"
                            onClick={() => setSizeChartOpen(true)}
                            className="flex w-full items-center justify-between border-b-[0.5px] border-[#E2E5F0] py-3.5"
                        >
                            <span className="text-[13px] text-[#8E96B0]">Correspondances de taille</span>
                            <ChevronRight className="size-4 text-[#E2E5F0]" />
                        </button>
                    )}

                    {/* ── Shop line ── */}
                    {product.merchants && (
                        <Link
                            href={shopSlug ? `/shop/${shopSlug}` : "#"}
                            className="flex items-center gap-3 border-b-[0.5px] border-[#E2E5F0] py-3.5"
                        >
                            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-[0.5px] border-[rgba(255,255,255,0.08)] bg-[#F5F6FA]">
                                {product.merchants.photo_url ? (
                                    <img src={product.merchants.photo_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="text-lg">🏪</span>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium text-[#6B7799]">
                                    {product.merchants.name}
                                </p>
                                <p className="mt-0.5 text-[11px] text-[#8E96B0]">
                                    {product.merchants.address}, {product.merchants.city}
                                </p>
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-[#E2E5F0]" />
                        </Link>
                    )}

                    {/* ── Description ── */}
                    {product.description && (
                        <div className="border-b-[0.5px] border-[#E2E5F0] py-4">
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#8E96B0]">Description</p>
                            <p className="text-[13px] leading-relaxed text-[#8E96B0]">{product.description}</p>
                        </div>
                    )}

                    {/* ── J'arrive button ── */}
                    {quantity > 0 && (
                        <div className="pt-5">
                            {othersCount > 0 && !intentSent && (
                                <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#FFF4F0] px-3.5 py-2.5">
                                    <span className="text-[13px]">🔥</span>
                                    <p className="text-[11px] font-medium text-[#E8553A]">
                                        {othersCount === 1
                                            ? "1 autre personne est aussi intéressée"
                                            : `${othersCount} autres personnes sont aussi intéressées`}
                                    </p>
                                </div>
                            )}
                            {intentSent ? (
                                <button
                                    type="button"
                                    disabled
                                    className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#F0F1F5] py-[13px] text-[13px] font-semibold text-[#8E96B0]"
                                >
                                    ✓ Le commerçant est prévenu
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleIntent}
                                    disabled={intentLoading}
                                    className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#4268FF] py-[13px] text-[14px] font-bold text-white transition active:opacity-90 disabled:opacity-60"
                                >
                                    {intentLoading ? (
                                        <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    ) : (
                                        <>📍 J&apos;arrive !</>
                                    )}
                                </button>
                            )}
                            <p className="mt-1.5 text-center text-[10px] text-[#8E96B0]">
                                {intentSent
                                    ? `${product?.merchants?.name ?? "La boutique"} sait que tu arrives — valable 2h`
                                    : "Sous réserve de disponibilité — le commerçant est prévenu"}
                            </p>
                        </div>
                    )}

                    {/* ── CTA button ── */}
                    <div className="pt-5">
                        <button
                            type="button"
                            onClick={() => setContactSheetOpen(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-[14px] border-[0.5px] border-[#E2E5F0] bg-transparent py-[13px] text-[13px] font-medium text-[#8E96B0] transition active:opacity-80"
                        >
                            <Phone01 className="size-4" />
                            Contacter la boutique
                        </button>
                    </div>
                </div>
            ) : null}

            {/* ── Size bottom sheet ── */}
            <AnimatePresence>
                {sizeSheetOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/60"
                            onClick={() => setSizeSheetOpen(false)}
                        />

                        {/* Sheet */}
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 300 }}
                            className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-[#F8F9FC]"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                        >
                            {/* Handle + header */}
                            <div className="sticky top-0 z-10 bg-[#F8F9FC] px-5 pb-3 pt-3">
                                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#E2E5F0]" />
                                <div className="flex items-center justify-between">
                                    <h2 className="text-[15px] font-semibold text-[#1A1F36]">
                                        {/^\d/.test(availableSizes[0]?.size ?? "") ? "Sélectionnez votre pointure" : "Sélectionnez votre taille"}
                                    </h2>
                                    <button type="button" onClick={() => setSizeSheetOpen(false)} className="flex size-8 items-center justify-center rounded-full bg-[#F5F6FA]">
                                        <XClose className="size-4 text-[#8E96B0]" />
                                    </button>
                                </div>
                            </div>

                            {/* Size grid */}
                            <div className="grid grid-cols-4 gap-2 px-5 pb-4">
                                {availableSizes.map((s) => {
                                    const isSelected = selectedSize === s.size;
                                    const isOos = s.quantity === 0;

                                    return (
                                        <button
                                            key={s.size}
                                            type="button"
                                            disabled={isOos}
                                            onClick={() => {
                                                setSelectedSize(s.size);
                                                setSizeSheetOpen(false);
                                            }}
                                            className={`relative rounded-xl border-[0.5px] py-3 text-[13px] font-medium transition duration-100 ${
                                                isSelected
                                                    ? "border-[#4268FF] bg-[#4268FF] text-[#FFFFFF]"
                                                    : isOos
                                                      ? "border-[#F5F6FA] bg-[#F8F9FC] text-[#E2E5F0] line-through"
                                                      : "border-[#E2E5F0] bg-[#F5F6FA] text-[#6B7799]"
                                            }`}
                                        >
                                            {s.size}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ── Size chart bottom sheet ── */}
            <AnimatePresence>
                {sizeChartOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/60"
                            onClick={() => setSizeChartOpen(false)}
                        />
                        <motion.div
                            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 300 }}
                            className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-[#F8F9FC]"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                        >
                            <div className="sticky top-0 z-10 bg-[#F8F9FC] px-5 pb-3 pt-3">
                                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#E2E5F0]" />
                                <div className="flex items-center justify-between">
                                    <h2 className="text-[15px] font-semibold text-[#1A1F36]">Correspondances de taille</h2>
                                    <button type="button" onClick={() => setSizeChartOpen(false)} className="flex size-8 items-center justify-center rounded-full bg-[#F5F6FA]">
                                        <XClose className="size-4 text-[#8E96B0]" />
                                    </button>
                                </div>
                            </div>

                            {/chaussure|sneaker|boot/i.test(product?.category ?? "") ? (
                                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr>
                                            <th className="border-b-[0.5px] border-[#E2E5F0] px-4 py-2.5 text-left font-medium text-[#8E96B0]">EU</th>
                                            <th className="border-b-[0.5px] border-[#E2E5F0] px-4 py-2.5 text-center font-medium text-[#8E96B0]">US</th>
                                            <th className="border-b-[0.5px] border-[#E2E5F0] px-4 py-2.5 text-right font-medium text-[#8E96B0]">UK</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            { eu: "35", us: "4", uk: "2.5" }, { eu: "36", us: "5", uk: "3.5" },
                                            { eu: "37", us: "6", uk: "4.5" }, { eu: "38", us: "7", uk: "5.5" },
                                            { eu: "39", us: "8", uk: "6.5" }, { eu: "40", us: "9", uk: "7.5" },
                                            { eu: "41", us: "10", uk: "8.5" }, { eu: "42", us: "11", uk: "9.5" },
                                            { eu: "43", us: "12", uk: "10.5" }, { eu: "44", us: "13", uk: "11.5" },
                                            { eu: "45", us: "14", uk: "12.5" }, { eu: "46", us: "15", uk: "13.5" },
                                        ].map((row) => (
                                            <tr key={row.eu}>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 font-medium text-[#1A1F36]">{row.eu}</td>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 text-center text-[#6B7799]">{row.us}</td>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 text-right text-[#6B7799]">{row.uk}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr>
                                            <th className="border-b-[0.5px] border-[#E2E5F0] px-4 py-2.5 text-left font-medium text-[#8E96B0]">Taille</th>
                                            <th className="border-b-[0.5px] border-[#E2E5F0] px-4 py-2.5 text-center font-medium text-[#8E96B0]">EU</th>
                                            <th className="border-b-[0.5px] border-[#E2E5F0] px-4 py-2.5 text-right font-medium text-[#8E96B0]">US</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            { label: "XS", eu: "34/36", us: "2/4" }, { label: "S", eu: "38/40", us: "6/8" },
                                            { label: "M", eu: "42/44", us: "10/12" }, { label: "L", eu: "46/48", us: "14/16" },
                                            { label: "XL", eu: "50/52", us: "18/20" }, { label: "XXL", eu: "54/56", us: "22/24" },
                                        ].map((row) => (
                                            <tr key={row.label}>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 font-medium text-[#1A1F36]">{row.label}</td>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 text-center text-[#6B7799]">{row.eu}</td>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 text-right text-[#6B7799]">{row.us}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ── Contact bottom sheet ── */}
            <AnimatePresence>
                {contactSheetOpen && shop && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/60"
                            onClick={() => setContactSheetOpen(false)}
                        />
                        <motion.div
                            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 300 }}
                            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-[#F8F9FC]"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                        >
                            <div className="mx-auto mb-3 mt-3 h-1 w-9 rounded-full bg-white/15" />

                            {/* Shop info */}
                            <div className="px-5 pb-4 text-center">
                                <p className="text-base font-semibold text-[#1A1F36]">{shop.name}</p>
                                <p className="mt-1 text-xs text-[#8E96B0]">{shop.address}, {shop.city}</p>
                            </div>

                            {shop.phone ? (
                                <>
                                    <div className="px-5 pb-4 text-center">
                                        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[#8E96B0]">Téléphone</p>
                                        <p className="text-[22px] font-semibold tracking-wide text-[#6B7799]">{shop.phone}</p>
                                    </div>

                                    <div className="flex gap-2.5 px-5 pb-5">
                                        <a
                                            href={`tel:${shop.phone.replace(/\s/g, "")}`}
                                            className="flex flex-1 items-center justify-center rounded-[14px] bg-[#6ecf7f] py-[14px] text-[14px] font-bold text-[#0a2a10] transition active:opacity-90"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            Appeler
                                        </a>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(shop.phone!);
                                                setPhoneCopied(true);
                                                setTimeout(() => setPhoneCopied(false), 2000);
                                            }}
                                            className="flex flex-1 items-center justify-center rounded-[14px] border-[0.5px] border-[#E2E5F0] py-[14px] text-[14px] font-medium text-[#8E96B0] transition active:opacity-80"
                                        >
                                            {phoneCopied ? "Copié !" : "Copier"}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="px-5 pb-5 text-center">
                                    <p className="text-[13px] text-[#8E96B0]">Ce marchand n&apos;a pas encore renseigné son numéro de téléphone.</p>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

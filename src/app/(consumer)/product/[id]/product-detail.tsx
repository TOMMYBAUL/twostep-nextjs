"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Phone01, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { generateSlug } from "@/lib/slug";
import { HeartButton } from "../../components/heart-button";
import { useFavorites, useToggleFavorite } from "../../hooks/use-favorites";

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
    merchant_id: string;
    stock: { quantity: number }[];
    promotions: { sale_price: number; ends_at: string | null }[];
    merchants?: {
        name: string;
        address: string;
        city: string;
        photo_url: string | null;
        phone?: string | null;
        opening_hours?: Record<string, { open: string; close: string }> | null;
    };
}

const SHOE_SIZES = [35, 35.5, 36, 36.5, 37, 37.5, 38, 38.5, 39, 39.5, 40, 40.5, 41, 41.5, 42, 42.5, 43, 43.5, 44, 44.5, 45, 45.5, 46, 46.5, 47] as const;

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

    const quantity = product?.stock?.[0]?.quantity ?? 0;
    const activePromo = product?.promotions?.find(
        (p) => !p.ends_at || new Date(p.ends_at) > new Date(),
    );
    const discount = activePromo ? Math.round(((product!.price - activePromo.sale_price) / product!.price) * 100) : 0;
    const displayPrice = activePromo ? activePromo.sale_price : product?.price;

    const [selectedSize, setSelectedSize] = useState<number | null>(null);
    const [sizeSheetOpen, setSizeSheetOpen] = useState(false);
    const [sizeChartOpen, setSizeChartOpen] = useState(false);
    const [contactSheetOpen, setContactSheetOpen] = useState(false);
    const [phoneCopied, setPhoneCopied] = useState(false);

    const shopSlug = product?.merchants?.name ? generateSlug(product.merchants.name, product.merchant_id) : null;

    const shop = product?.merchants;

    return (
        <div className="min-h-dvh bg-[#130e07] md:flex md:min-h-screen md:flex-row">
            {/* ── Image zone ── */}
            <div className="relative h-[300px] w-full overflow-hidden bg-[#1e1409] md:sticky md:top-0 md:h-screen md:w-1/2">
                {(product?.photo_processed_url ?? product?.photo_url) ? (
                    <img src={product.photo_processed_url ?? product.photo_url ?? "/placeholder-product.svg"} alt={product?.name ?? ""} className="h-full w-full object-cover object-center" />
                ) : (
                    <div className="flex h-full items-center justify-center">
                        {isLoading ? null : (
                            <span className="text-6xl font-bold text-[#3d2a10]/30">
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
                    style={{ marginTop: "env(safe-area-inset-top)", background: "rgba(13,9,4,0.55)" }}
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
                        className="!size-8 !rounded-full [background:rgba(13,9,4,0.55)]"
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
                    <div className="h-3 w-32 animate-pulse rounded bg-[#2a1a08]" />
                    <div className="h-6 w-48 animate-pulse rounded bg-[#2a1a08]" />
                    <div className="h-4 w-24 animate-pulse rounded bg-[#2a1a08]" />
                </div>
            ) : product ? (
                <div className="px-5 pb-40 pt-5 md:w-1/2 md:overflow-y-auto md:px-10 md:pb-12 md:pt-12">
                    {/* Brand · Category + stock tag */}
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[#7a5c30]">
                            {[product.brand, product.category].filter(Boolean).join(" · ")}
                        </span>
                        {quantity === 0 && (
                            <span className="rounded-md border-[0.5px] border-[rgba(200,120,48,0.25)] px-2 py-[2px] text-[10px] font-medium text-[#c87830]" style={{ background: "rgba(200,120,48,0.12)" }}>
                                Épuisé en boutique
                            </span>
                        )}
                    </div>

                    {/* Product name */}
                    <h1 className="mb-2.5 text-xl font-bold leading-tight tracking-tight text-[#f0dfc0] md:text-2xl">
                        {product.name}
                    </h1>

                    {/* Price line */}
                    <div className="mb-5 flex items-baseline gap-2.5">
                        <span className="text-base font-normal text-[#e8d4b0]">
                            {displayPrice?.toFixed(2)} €
                        </span>
                        {activePromo && (
                            <>
                                <span className="text-[13px] text-[#3d2a10] line-through">
                                    {product.price.toFixed(2)} €
                                </span>
                                <span className="text-xs font-medium text-[#c87830]">
                                    −{discount}%
                                </span>
                            </>
                        )}
                    </div>

                    {/* ── Size selector line ── */}
                    <button
                        type="button"
                        onClick={() => setSizeSheetOpen(true)}
                        className="flex w-full items-center justify-between border-y-[0.5px] border-[rgba(255,255,255,0.07)] py-4"
                    >
                        <span className="text-[13px] text-[#a07840]">Pointure</span>
                        <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#f0dfc0]">
                            {selectedSize ?? "Sélectionner"}
                            <ChevronRight className="size-4 text-[#3d2a10]" />
                        </span>
                    </button>

                    {/* Size guide line */}
                    <button
                        type="button"
                        onClick={() => setSizeChartOpen(true)}
                        className="flex w-full items-center justify-between border-b-[0.5px] border-[rgba(255,255,255,0.07)] py-3.5"
                    >
                        <span className="text-[13px] text-[#a07840]">Correspondances de taille</span>
                        <ChevronRight className="size-4 text-[#3d2a10]" />
                    </button>

                    {/* ── Shop line ── */}
                    {product.merchants && (
                        <Link
                            href={shopSlug ? `/shop/${shopSlug}` : "#"}
                            className="flex items-center gap-3 border-b-[0.5px] border-[rgba(255,255,255,0.07)] py-3.5"
                        >
                            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-[0.5px] border-[rgba(255,255,255,0.08)] bg-[#2a1c0a]">
                                {product.merchants.photo_url ? (
                                    <img src={product.merchants.photo_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="text-lg">🏪</span>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium text-[#e8d4b0]">
                                    {product.merchants.name}
                                </p>
                                <p className="mt-0.5 text-[11px] text-[#8a6a3a]">
                                    {product.merchants.address}, {product.merchants.city}
                                </p>
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-[#3d2a10]" />
                        </Link>
                    )}

                    {/* ── Description ── */}
                    {product.description && (
                        <div className="border-b-[0.5px] border-[rgba(255,255,255,0.07)] py-4">
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#7a5c30]">Description</p>
                            <p className="text-[13px] leading-relaxed text-[#a07840]">{product.description}</p>
                        </div>
                    )}

                    {/* ── CTA button ── */}
                    <div className="pt-5">
                        <button
                            type="button"
                            onClick={() => setContactSheetOpen(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-[14px] border-[0.5px] border-[#3d2a10] bg-transparent py-[13px] text-[13px] font-medium text-[#a07840] transition active:opacity-80"
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
                            className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-[#1c1209]"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                        >
                            {/* Handle + header */}
                            <div className="sticky top-0 z-10 bg-[#1c1209] px-5 pb-3 pt-3">
                                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#3d2a10]" />
                                <div className="flex items-center justify-between">
                                    <h2 className="text-[15px] font-semibold text-[#f0dfc0]">Sélectionnez votre pointure</h2>
                                    <button type="button" onClick={() => setSizeSheetOpen(false)} className="flex size-8 items-center justify-center rounded-full bg-[#2a1a08]">
                                        <XClose className="size-4 text-[#a07840]" />
                                    </button>
                                </div>
                            </div>

                            {/* Size grid */}
                            <div className="grid grid-cols-4 gap-2 px-5 pb-4">
                                {SHOE_SIZES.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => { setSelectedSize(s); setSizeSheetOpen(false); }}
                                        className={`rounded-xl border-[0.5px] py-3 text-[13px] font-medium transition duration-100 ${
                                            selectedSize === s
                                                ? "border-[#c87830] bg-[#c87830] text-[#130e07]"
                                                : "border-[#3d2a10] bg-[#2a1a08] text-[#e8d4b0]"
                                        }`}
                                    >
                                        {s}
                                    </button>
                                ))}
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
                            className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-[#1c1209]"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                        >
                            <div className="sticky top-0 z-10 bg-[#1c1209] px-5 pb-3 pt-3">
                                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#3d2a10]" />
                                <div className="flex items-center justify-between">
                                    <h2 className="text-[15px] font-semibold text-[#f0dfc0]">Correspondances de taille</h2>
                                    <button type="button" onClick={() => setSizeChartOpen(false)} className="flex size-8 items-center justify-center rounded-full bg-[#2a1a08]">
                                        <XClose className="size-4 text-[#a07840]" />
                                    </button>
                                </div>
                            </div>

                            {/chaussure|sneaker|boot/i.test(product?.category ?? "") ? (
                                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr>
                                            <th className="border-b-[0.5px] border-[rgba(255,255,255,0.07)] px-4 py-2.5 text-left font-medium text-[#a07840]">EU</th>
                                            <th className="border-b-[0.5px] border-[rgba(255,255,255,0.07)] px-4 py-2.5 text-center font-medium text-[#a07840]">US</th>
                                            <th className="border-b-[0.5px] border-[rgba(255,255,255,0.07)] px-4 py-2.5 text-right font-medium text-[#a07840]">UK</th>
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
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 font-medium text-[#f0dfc0]">{row.eu}</td>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 text-center text-[#e8d4b0]">{row.us}</td>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 text-right text-[#e8d4b0]">{row.uk}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr>
                                            <th className="border-b-[0.5px] border-[rgba(255,255,255,0.07)] px-4 py-2.5 text-left font-medium text-[#a07840]">Taille</th>
                                            <th className="border-b-[0.5px] border-[rgba(255,255,255,0.07)] px-4 py-2.5 text-center font-medium text-[#a07840]">EU</th>
                                            <th className="border-b-[0.5px] border-[rgba(255,255,255,0.07)] px-4 py-2.5 text-right font-medium text-[#a07840]">US</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            { label: "XS", eu: "34/36", us: "2/4" }, { label: "S", eu: "38/40", us: "6/8" },
                                            { label: "M", eu: "42/44", us: "10/12" }, { label: "L", eu: "46/48", us: "14/16" },
                                            { label: "XL", eu: "50/52", us: "18/20" }, { label: "XXL", eu: "54/56", us: "22/24" },
                                        ].map((row) => (
                                            <tr key={row.label}>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 font-medium text-[#f0dfc0]">{row.label}</td>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 text-center text-[#e8d4b0]">{row.eu}</td>
                                                <td className="border-b-[0.5px] border-[rgba(255,255,255,0.05)] px-4 py-3 text-right text-[#e8d4b0]">{row.us}</td>
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
                            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-[#1c1209]"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                        >
                            <div className="mx-auto mb-3 mt-3 h-1 w-9 rounded-full bg-white/15" />

                            {/* Shop info */}
                            <div className="px-5 pb-4 text-center">
                                <p className="text-base font-semibold text-[#f0dfc0]">{shop.name}</p>
                                <p className="mt-1 text-xs text-[#8a6a3a]">{shop.address}, {shop.city}</p>
                            </div>

                            {shop.phone ? (
                                <>
                                    <div className="px-5 pb-4 text-center">
                                        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[#a07840]">Téléphone</p>
                                        <p className="text-[22px] font-semibold tracking-wide text-[#e8d4b0]">{shop.phone}</p>
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
                                            className="flex flex-1 items-center justify-center rounded-[14px] border-[0.5px] border-[#3d2a10] py-[14px] text-[14px] font-medium text-[#a07840] transition active:opacity-80"
                                        >
                                            {phoneCopied ? "Copié !" : "Copier"}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="px-5 pb-5 text-center">
                                    <p className="text-[13px] text-[#8a6a3a]">Ce marchand n&apos;a pas encore renseigné son numéro de téléphone.</p>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

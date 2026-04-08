"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Phone01, XClose, Building07, AlertCircle, Lightning02 } from "@untitledui/icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { generateSlug } from "@/lib/slug";
import { cx } from "@/utils/cx";
import { HeartButton } from "../../components/heart-button";
import { useFavorites, useToggleFavorite } from "../../hooks/use-favorites";
import { useFocusTrap } from "../../hooks/use-focus-trap";
import { useGeolocation } from "../../hooks/use-geolocation";
import { ShopStatusBlock } from "./shop-status-block";
import { StickyCtaBar } from "./sticky-cta-bar";

/* ── Haversine distance helper ── */

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Types ── */

interface SizeVariant {
    size: string;
    quantity: number;
}

interface ProductDetail {
    id: string;
    name: string;
    canonical_name: string | null;
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
        lat?: number | null;
        lng?: number | null;
    };
}

/* ── Constants ── */

const MAX_INLINE_CHIPS = 6;

const SPRING_SHEET = { type: "spring" as const, damping: 28, stiffness: 300 };

/* ── Component ── */

export default function ProductDetailClient() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const prefersReducedMotion = useReducedMotion();
    const { position: userPosition } = useGeolocation();

    const springOrInstant = prefersReducedMotion
        ? { duration: 0 }
        : SPRING_SHEET;

    /* ── Data fetching ── */

    const { data: product, isLoading } = useQuery<ProductDetail | null>({
        queryKey: ["product", id],
        queryFn: async () => {
            const res = await fetch(`/api/products/${id}`);
            const json = await res.json();
            // Variant redirect: API returns 301 with redirect path
            if (json.redirect) {
                router.replace(json.redirect);
                return null;
            }
            if (!res.ok) throw new Error("Failed");
            return json.product;
        },
    });

    /* ── Favorites ── */

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();

    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);
    const productUuid = product?.id;
    const isFavorite = productUuid ? favoriteIds.has(productUuid) : false;

    /* ── Derived data ── */

    const stockData = product?.stock;
    const quantity = Array.isArray(stockData)
        ? (stockData[0]?.quantity ?? 0)
        : (stockData && typeof stockData === "object" && "quantity" in stockData
            ? (stockData as { quantity: number }).quantity
            : 0);

    const activePromo = product?.promotions?.find(
        (p) => !p.ends_at || new Date(p.ends_at) > new Date(),
    );
    const discount = activePromo
        ? Math.round(((product!.price - activePromo.sale_price) / product!.price) * 100)
        : 0;
    const displayPrice = activePromo ? activePromo.sale_price : product?.price;
    const salePrice = activePromo ? activePromo.sale_price : null;

    const availableSizes = product?.available_sizes ?? [];
    const inStockSizes = availableSizes.filter((s) => s.quantity > 0);
    const hasSizes = availableSizes.length > 0;
    const isPointure = /^\d/.test(inStockSizes[0]?.size ?? "");

    /* ── State ── */

    const [selectedSize, setSelectedSize] = useState<string | null>(null);
    const [sizeSheetOpen, setSizeSheetOpen] = useState(false);
    const [sizeChartOpen, setSizeChartOpen] = useState(false);
    const [contactSheetOpen, setContactSheetOpen] = useState(false);
    const [phoneCopied, setPhoneCopied] = useState(false);
    const [intentSent, setIntentSent] = useState(false);
    const [intentLoading, setIntentLoading] = useState(false);
    const [intentError, setIntentError] = useState(false);
    const [othersCount, setOthersCount] = useState(0);

    /* ── Focus trapping for sheets ── */
    const sizeSheetRef = useFocusTrap(sizeSheetOpen);
    const sizeChartRef = useFocusTrap(sizeChartOpen);
    const contactSheetRef = useFocusTrap(contactSheetOpen);

    /* ── Escape key handler for sheets ── */
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (contactSheetOpen) setContactSheetOpen(false);
                else if (sizeChartOpen) setSizeChartOpen(false);
                else if (sizeSheetOpen) setSizeSheetOpen(false);
            }
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [sizeSheetOpen, sizeChartOpen, contactSheetOpen]);

    /* ── Distance ── */

    const merchant = product?.merchants;
    const distanceKm =
        userPosition && merchant?.lat != null && merchant?.lng != null
            ? haversineKm(userPosition.lat, userPosition.lng, merchant.lat, merchant.lng)
            : null;

    /* ── Fetch intent count ── */

    useEffect(() => {
        if (!product?.id) return;
        fetch(`/api/intents?product_id=${product.id}`)
            .then((r) => r.json())
            .then((d) => setOthersCount(d.count ?? 0))
            .catch(() => {});
    }, [product?.id, intentSent]);

    /* ── Intent handler ── */

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
            if (res.ok) { setIntentSent(true); setIntentError(false); }
            else setIntentError(true);
        } catch {
            setIntentError(true);
        } finally {
            setIntentLoading(false);
        }
    };

    /* ── Derived display ── */

    const productName = product?.canonical_name ?? product?.name ?? "";
    const photoSrc = product?.photo_processed_url ?? product?.photo_url;
    const isProcessed = !!product?.photo_processed_url;
    const shop = product?.merchants;

    /* ── Inline size chips (max 6 + overflow) ── */

    const visibleChips = inStockSizes.slice(0, MAX_INLINE_CHIPS);
    const overflowCount = inStockSizes.length - MAX_INLINE_CHIPS;

    return (
        <div className="min-h-dvh bg-primary md:flex md:min-h-screen md:flex-row">
            {/* ══════════════════════════════════════════════
                IMAGE HERO
            ══════════════════════════════════════════════ */}
            <div
                className={cx(
                    "relative w-full overflow-hidden md:sticky md:top-0 md:h-screen md:w-1/2",
                    isProcessed ? "bg-primary" : "bg-secondary",
                )}
            >
                {photoSrc ? (
                    <>
                        {/* Mobile: image auto-height, no empty space */}
                        <Image
                            src={photoSrc}
                            alt={productName}
                            width={800}
                            height={800}
                            priority
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className={cx(
                                "w-full object-center md:hidden",
                                isProcessed ? "max-h-[65dvh] object-contain p-6" : "max-h-[65dvh] object-contain",
                            )}
                        />
                        {/* Desktop: fill container, sticky half-screen */}
                        <Image
                            src={photoSrc}
                            alt={productName}
                            fill
                            priority
                            sizes="50vw"
                            className={cx(
                                "hidden object-center md:block",
                                isProcessed ? "object-contain p-6" : "object-cover",
                            )}
                        />
                    </>
                ) : (
                    <div className="flex h-[40dvh] w-full items-center justify-center md:h-full">
                        {!isLoading && (
                            <span
                                className="text-6xl font-bold text-primary/15 select-none"
                                aria-hidden="true"
                            >
                                {productName.charAt(0)}
                            </span>
                        )}
                    </div>
                )}

                {/* Back button (mobile) */}
                <button
                    type="button"
                    onClick={() =>
                        window.history.length > 1
                            ? window.history.back()
                            : (window.location.href = "/discover")
                    }
                    className="absolute left-4 top-4 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/55 backdrop-blur-sm md:hidden focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                    style={{ marginTop: "env(safe-area-inset-top)" }}
                    aria-label="Retour"
                >
                    <ArrowLeft className="size-4 text-white/90" aria-hidden="true" />
                </button>

                {/* Heart button (mobile) */}
                <div
                    className="absolute right-4 top-4 md:hidden"
                    style={{ marginTop: "env(safe-area-inset-top)" }}
                >
                    <HeartButton
                        isFavorite={isFavorite}
                        onToggle={() => {
                            if (!productUuid) return;
                            if (isFavorite) remove.mutate(productUuid);
                            else add.mutate(productUuid);
                        }}
                        ariaLabel={`${isFavorite ? "Retirer" : "Ajouter"} ${productName} des favoris`}
                    />
                </div>

                {/* Dot indicator (mobile) */}
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 md:hidden">
                    <div className="h-[5px] w-[14px] rounded-[3px] bg-white" />
                </div>
            </div>

            {/* ══════════════════════════════════════════════
                INFO / PULL-UP CARD
            ══════════════════════════════════════════════ */}
            {isLoading ? (
                <div className="space-y-3 rounded-t-2xl bg-primary -mt-5 relative z-10 px-5 pt-6 md:mt-0 md:w-1/2 md:rounded-none md:px-10 md:pt-12">
                    <div className="h-3 w-32 animate-pulse rounded bg-secondary" />
                    <div className="h-6 w-48 animate-pulse rounded bg-secondary" />
                    <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
                </div>
            ) : product ? (
                <div className="rounded-t-2xl bg-primary -mt-5 relative z-10 px-5 pb-44 pt-5 md:mt-0 md:w-1/2 md:overflow-y-auto md:rounded-none md:px-10 md:pb-12 md:pt-12">
                    {/* Brand / Category */}
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-tertiary">
                            {[product.brand, product.category].filter(Boolean).join(" \u00B7 ")}
                        </span>
                        {quantity === 0 && (
                            <span className="rounded-md border border-brand/25 bg-brand-secondary px-2 py-[2px] text-[10px] font-medium text-brand-secondary">
                                Indisponible
                            </span>
                        )}
                    </div>

                    {/* Product name */}
                    <h1 className="mb-2.5 text-xl font-bold leading-tight tracking-tight text-primary md:text-2xl">
                        {productName}
                    </h1>

                    {/* Price line */}
                    <div className="mb-5 flex items-baseline gap-2.5 tabular-nums">
                        <span className="text-base font-normal text-secondary">
                            {displayPrice?.toFixed(2)}&nbsp;&euro;
                        </span>
                        {activePromo && (
                            <>
                                <span className="text-[13px] text-tertiary line-through">
                                    {product.price.toFixed(2)}&nbsp;&euro;
                                </span>
                                <span className="text-xs font-medium text-brand-secondary">
                                    &minus;{discount}%
                                </span>
                            </>
                        )}
                    </div>

                    {/* ── Inline size chips ── */}
                    {hasSizes && (
                        <div className="mb-5">
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-tertiary">
                                {isPointure ? "Pointure" : "Taille"}
                            </p>
                            <div className="flex flex-wrap gap-2" role="group" aria-label={isPointure ? "Pointures disponibles" : "Tailles disponibles"}>
                                {visibleChips.map((s) => {
                                    const isSelected = selectedSize === s.size;
                                    return (
                                        <button
                                            key={s.size}
                                            type="button"
                                            onClick={() => setSelectedSize(s.size)}
                                            aria-pressed={isSelected}
                                            className={cx(
                                                "min-h-[44px] rounded-lg border px-4 py-2 text-[13px] font-medium transition duration-100 motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                                                isSelected
                                                    ? "border-brand bg-brand-secondary text-brand-secondary font-semibold border-[1.5px]"
                                                    : "border-secondary bg-primary text-quaternary",
                                            )}
                                        >
                                            {s.size}
                                        </button>
                                    );
                                })}
                                {overflowCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSizeSheetOpen(true)}
                                        className="min-h-[44px] rounded-lg border border-secondary bg-primary px-4 py-2 text-[13px] font-medium text-quaternary transition duration-100 motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                        aria-label={`Voir ${overflowCount} tailles supplémentaires`}
                                    >
                                        +{overflowCount}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Size guide line */}
                    {hasSizes && (
                        <button
                            type="button"
                            onClick={() => setSizeChartOpen(true)}
                            className="flex w-full items-center justify-between border-b border-secondary py-3.5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            <span className="text-[13px] text-tertiary">Correspondances de taille</span>
                            <ChevronRight className="size-4 text-tertiary" aria-hidden="true" />
                        </button>
                    )}

                    {/* ── Shop block ── */}
                    {shop && (
                        <ShopStatusBlock
                            merchantId={product.merchant_id}
                            name={shop.name}
                            address={shop.address}
                            city={shop.city}
                            photoUrl={shop.photo_url}
                            phone={shop.phone ?? null}
                            openingHours={shop.opening_hours ?? null}
                            distanceKm={distanceKm}
                        />
                    )}

                    {/* ── Description ── */}
                    {product.description && (
                        <div className="border-b border-secondary py-4">
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-tertiary">
                                Description
                            </p>
                            <p className="text-[13px] leading-relaxed text-tertiary">
                                {product.description}
                            </p>
                        </div>
                    )}

                    {/* ── Social proof ── */}
                    {othersCount > 0 && !intentSent && quantity > 0 && (
                        <div className="mt-4 flex items-center gap-2 rounded-xl bg-error-secondary px-3.5 py-2.5">
                            <Lightning02 className="size-4 text-error-primary" aria-hidden="true" />
                            <p className="text-[11px] font-medium text-error-primary">
                                {othersCount === 1
                                    ? "1 autre personne est aussi intéressée"
                                    : `${othersCount} autres personnes sont aussi intéressées`}
                            </p>
                        </div>
                    )}

                    {/* Intent error */}
                    {intentError && (
                        <div className="mt-3 rounded-xl bg-error-secondary px-3.5 py-2.5" role="alert">
                            <p className="text-[11px] font-medium text-error-primary">
                                Erreur lors de l'envoi — réessaie dans quelques instants.
                            </p>
                        </div>
                    )}

                    {/* ── Desktop J'arrive button (hidden on mobile — StickyCtaBar handles it) ── */}
                    {quantity > 0 && (
                        <div className="hidden pt-5 md:block">
                            {intentSent ? (
                                <button
                                    type="button"
                                    disabled
                                    className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-secondary py-[13px] text-[13px] font-semibold text-tertiary"
                                >
                                    &#x2713; Le commerçant est prévenu
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleIntent}
                                    disabled={intentLoading}
                                    className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-brand-solid py-[13px] text-[14px] font-bold text-white transition active:opacity-90 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                >
                                    {intentLoading ? (
                                        <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    ) : (
                                        "J'arrive !"
                                    )}
                                </button>
                            )}
                            <p className="mt-1.5 text-center text-[10px] text-tertiary">
                                {intentSent
                                    ? `${shop?.name ?? "La boutique"} sait que tu arrives — valable 2h`
                                    : "Sous réserve de disponibilité — le commerçant est prévenu"}
                            </p>
                        </div>
                    )}

                    {/* ── Contact button ── */}
                    <div className="pt-5">
                        <button
                            type="button"
                            onClick={() => setContactSheetOpen(true)}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] border border-secondary bg-transparent py-[13px] text-[13px] font-medium text-tertiary transition active:opacity-80 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            <Phone01 className="size-4" aria-hidden="true" />
                            Contacter la boutique
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center px-6 pb-24 pt-12 text-center md:w-1/2">
                    <AlertCircle className="size-10 text-tertiary" aria-hidden="true" />
                    <p className="mt-4 text-[15px] font-semibold text-primary">Produit introuvable</p>
                    <p className="mt-1.5 text-[13px] text-tertiary">Ce produit n'est plus disponible ou le lien est invalide.</p>
                    <button
                        type="button"
                        onClick={() => window.location.href = "/discover"}
                        className="mt-4 rounded-full bg-brand-solid px-5 py-2.5 text-sm font-semibold text-white transition active:opacity-80 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                        Retour à l'accueil
                    </button>
                </div>
            )}

            {/* ══════════════════════════════════════════════
                STICKY CTA BAR (mobile only)
            ══════════════════════════════════════════════ */}
            {product && (
                <StickyCtaBar
                    price={product.price}
                    salePrice={salePrice}
                    quantity={quantity}
                    hasSizes={hasSizes}
                    selectedSize={selectedSize}
                    intentSent={intentSent}
                    intentLoading={intentLoading}
                    onIntent={handleIntent}
                    onOpenSizeSheet={() => setSizeSheetOpen(true)}
                />
            )}

            {/* ══════════════════════════════════════════════
                SIZE BOTTOM SHEET
            ══════════════════════════════════════════════ */}
            <AnimatePresence>
                {sizeSheetOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/60"
                            role="button"
                            tabIndex={-1}
                            aria-label="Fermer"
                            onClick={() => setSizeSheetOpen(false)}
                        />
                        <motion.div
                            ref={sizeSheetRef}
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={springOrInstant}
                            className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-primary"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                            role="dialog"
                            aria-modal="true"
                            aria-label={isPointure ? "Sélection de pointure" : "Sélection de taille"}
                        >
                            {/* Handle + header */}
                            <div className="sticky top-0 z-10 bg-primary px-5 pb-3 pt-3">
                                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-tertiary" />
                                <div className="flex items-center justify-between">
                                    <h2 className="text-[15px] font-semibold text-primary">
                                        {isPointure ? "Sélectionnez votre pointure" : "Sélectionnez votre taille"}
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={() => setSizeSheetOpen(false)}
                                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                        aria-label="Fermer"
                                    >
                                        <XClose className="size-4 text-tertiary" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            {/* Size grid */}
                            <div className="grid grid-cols-4 gap-2 px-5 pb-4">
                                {inStockSizes.map((s) => {
                                    const isSelected = selectedSize === s.size;
                                    return (
                                        <button
                                            key={s.size}
                                            type="button"
                                            onClick={() => {
                                                setSelectedSize(s.size);
                                                setSizeSheetOpen(false);
                                            }}
                                            aria-pressed={isSelected}
                                            className={cx(
                                                "relative min-h-[44px] rounded-lg border py-3 text-[13px] font-medium transition duration-100 motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                                                isSelected
                                                    ? "border-brand bg-brand-secondary text-brand-secondary font-semibold border-[1.5px]"
                                                    : "border-secondary bg-primary text-quaternary",
                                            )}
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

            {/* ══════════════════════════════════════════════
                SIZE CHART BOTTOM SHEET
            ══════════════════════════════════════════════ */}
            <AnimatePresence>
                {sizeChartOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/60"
                            role="button"
                            tabIndex={-1}
                            aria-label="Fermer"
                            onClick={() => setSizeChartOpen(false)}
                        />
                        <motion.div
                            ref={sizeChartRef}
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={springOrInstant}
                            className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-primary"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Correspondances de taille"
                        >
                            <div className="sticky top-0 z-10 bg-primary px-5 pb-3 pt-3">
                                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-tertiary" />
                                <div className="flex items-center justify-between">
                                    <h2 className="text-[15px] font-semibold text-primary">
                                        Correspondances de taille
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={() => setSizeChartOpen(false)}
                                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                        aria-label="Fermer"
                                    >
                                        <XClose className="size-4 text-tertiary" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            {/chaussure|sneaker|boot/i.test(product?.category ?? "") ? (
                                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr>
                                            <th className="border-b border-secondary px-4 py-2.5 text-left font-medium text-tertiary">EU</th>
                                            <th className="border-b border-secondary px-4 py-2.5 text-center font-medium text-tertiary">US</th>
                                            <th className="border-b border-secondary px-4 py-2.5 text-right font-medium text-tertiary">UK</th>
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
                                                <td className="border-b border-tertiary px-4 py-3 font-medium text-primary">{row.eu}</td>
                                                <td className="border-b border-tertiary px-4 py-3 text-center text-secondary">{row.us}</td>
                                                <td className="border-b border-tertiary px-4 py-3 text-right text-secondary">{row.uk}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr>
                                            <th className="border-b border-secondary px-4 py-2.5 text-left font-medium text-tertiary">Taille</th>
                                            <th className="border-b border-secondary px-4 py-2.5 text-center font-medium text-tertiary">EU</th>
                                            <th className="border-b border-secondary px-4 py-2.5 text-right font-medium text-tertiary">US</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            { label: "XS", eu: "34/36", us: "2/4" }, { label: "S", eu: "38/40", us: "6/8" },
                                            { label: "M", eu: "42/44", us: "10/12" }, { label: "L", eu: "46/48", us: "14/16" },
                                            { label: "XL", eu: "50/52", us: "18/20" }, { label: "XXL", eu: "54/56", us: "22/24" },
                                        ].map((row) => (
                                            <tr key={row.label}>
                                                <td className="border-b border-tertiary px-4 py-3 font-medium text-primary">{row.label}</td>
                                                <td className="border-b border-tertiary px-4 py-3 text-center text-secondary">{row.eu}</td>
                                                <td className="border-b border-tertiary px-4 py-3 text-right text-secondary">{row.us}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ══════════════════════════════════════════════
                CONTACT BOTTOM SHEET
            ══════════════════════════════════════════════ */}
            <AnimatePresence>
                {contactSheetOpen && shop && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/60"
                            role="button"
                            tabIndex={-1}
                            aria-label="Fermer"
                            onClick={() => setContactSheetOpen(false)}
                        />
                        <motion.div
                            ref={contactSheetRef}
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={springOrInstant}
                            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-primary"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Contacter la boutique"
                        >
                            <div className="mx-auto mb-3 mt-3 h-1 w-9 rounded-full bg-tertiary" />

                            {/* Shop info */}
                            <div className="px-5 pb-4 text-center">
                                <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-[10px] bg-secondary">
                                    <Building07 className="size-5 text-brand-secondary" aria-hidden="true" />
                                </div>
                                <p className="text-base font-semibold text-primary">{shop.name}</p>
                                <p className="mt-1 text-xs text-tertiary">
                                    {shop.address}, {shop.city}
                                </p>
                            </div>

                            {shop.phone ? (
                                <>
                                    <div className="px-5 pb-4 text-center">
                                        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-tertiary">
                                            Téléphone
                                        </p>
                                        <p className="text-[22px] font-semibold tracking-wide text-secondary">
                                            {shop.phone}
                                        </p>
                                    </div>

                                    <div className="flex gap-2.5 px-5 pb-5">
                                        <a
                                            href={`tel:${shop.phone.replace(/\s/g, "")}`}
                                            className="flex min-h-[44px] flex-1 items-center justify-center rounded-[14px] bg-success-solid py-[14px] text-[14px] font-bold text-white transition active:opacity-90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            Appeler
                                        </a>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                try {
                                                    navigator.clipboard.writeText(shop.phone!);
                                                } catch { /* */ }
                                                setPhoneCopied(true);
                                                setTimeout(() => setPhoneCopied(false), 2000);
                                            }}
                                            className="flex min-h-[44px] flex-1 items-center justify-center rounded-[14px] border border-secondary py-[14px] text-[14px] font-medium text-tertiary transition active:opacity-80 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                        >
                                            {phoneCopied ? "Copié !" : "Copier"}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="px-5 pb-5 text-center">
                                    <p className="text-[13px] text-tertiary">
                                        Ce marchand n&apos;a pas encore renseigné son numéro de téléphone.
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

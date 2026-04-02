"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { ArrowLeft, MarkerPin01, Clock, ChevronDown, Share07, Globe02, AlertCircle } from "@untitledui/icons";
import Instagram from "@/components/foundations/social-icons/instagram";
import TikTok from "@/components/foundations/social-icons/tiktok";
import { useState, useEffect } from "react";
import { useFavorites, useToggleFavorite } from "../../hooks/use-favorites";
import { useFollows, useToggleFollow } from "../../hooks/use-follows";
import { getOpenStatus, formatWeeklyHours } from "../../lib/opening-hours";
import { cx } from "@/utils/cx";
import { ShopBadges } from "@/components/shop/shop-badges";
import { SuggestionDrawer } from "../../components/suggestion-drawer";
import { ProductCard } from "../../components/product-card";

interface MerchantProfile {
    merchant_id: string;
    merchant_name: string;
    merchant_description: string | null;
    merchant_photo: string | null;
    merchant_logo: string | null;
    merchant_cover: string | null;
    merchant_address: string;
    merchant_city: string;
    merchant_links: Record<string, string> | null;
    merchant_opening_hours: unknown;
    product_count: number;
    follower_count: number;
    is_following: boolean;
}

interface Product {
    id: string;
    name: string;
    canonical_name: string | null;
    price: number;
    photo_url: string | null;
    photo_processed_url: string | null;
    category: string | null;
    created_at: string;
    stock: { quantity: number } | null;
}

interface Promotion {
    id: string;
    product_id: string;
    sale_price: number;
}

const SUB_TABS = ["Catalogue", "Promos", "Avis"];

export default function ShopProfileClient() {
    const { id } = useParams<{ id: string }>();
    const [activeTab, setActiveTab] = useState("Catalogue");
    const [suggestionOpen, setSuggestionOpen] = useState(false);
    const prefersReducedMotion = useReducedMotion();

    const { data: profile, isLoading, isError } = useQuery<MerchantProfile>({
        queryKey: ["merchant-profile", id],
        queryFn: async () => {
            const res = await fetch(`/api/merchants/${id}/profile`);
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            return json.merchant;
        },
    });

    const { data: products } = useQuery<Product[]>({
        queryKey: ["merchant-products", id],
        queryFn: async () => {
            const res = await fetch(`/api/products?merchant_id=${id}`);
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            return json.products;
        },
    });

    const { data: promotions } = useQuery<Promotion[]>({
        queryKey: ["merchant-promos", id],
        queryFn: async () => {
            const res = await fetch(`/api/promotions?merchant_id=${id}`);
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            return json.promotions;
        },
    });

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();
    const { data: follows } = useFollows();
    const { follow, unfollow } = useToggleFollow();

    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);
    const merchantUuid = profile?.merchant_id;

    const isFollowing = follows?.some((f) => f.merchant_id === merchantUuid) ?? false;

    useEffect(() => {
        if (merchantUuid) {
            fetch("/api/page-views", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ merchant_id: merchantUuid, page_type: "shop" }),
            }).catch(() => {});
        }
    }, [merchantUuid]);

    const promoMap = new Map((promotions ?? []).map((p) => [p.product_id, p.sale_price]));

    const filteredProducts = (products ?? []).filter((p) => {
        if (activeTab === "Promos") {
            return promoMap.has(p.id);
        }
        return true;
    });

    /* Loading skeleton */
    if (isLoading) {
        return (
            <div className="min-h-dvh bg-secondary">
                <div className="h-52 animate-pulse bg-primary" />
                <div className="space-y-3 p-4">
                    <div className="h-6 w-48 animate-pulse rounded-xl bg-primary" />
                    <div className="h-4 w-32 animate-pulse rounded-xl bg-primary" />
                </div>
            </div>
        );
    }

    /* Error state */
    if (isError || !profile) {
        return (
            <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-secondary px-6">
                <AlertCircle className="size-12 text-tertiary" aria-hidden="true" />
                <h1 className="text-lg font-semibold text-primary">Boutique introuvable</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-brand-solid px-6 py-3 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                    Retour &agrave; l&apos;accueil
                </Link>
            </div>
        );
    }

    const links = profile.merchant_links ?? {};

    return (
        <div className="min-h-dvh bg-secondary">
            {/* Cover photo — TGTG style */}
            <div className="relative h-[45vh] min-h-[300px] max-h-[420px] w-full">
                {profile.merchant_cover ? (
                    <Image
                        src={profile.merchant_cover}
                        alt=""
                        fill
                        priority
                        sizes="100vw"
                        className="h-full w-full object-cover"
                    />
                ) : profile.merchant_photo ? (
                    <Image
                        src={profile.merchant_photo}
                        alt=""
                        fill
                        priority
                        sizes="100vw"
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-solid to-brand-solid_hover">
                        <span className="text-6xl font-bold text-white/30">{profile.merchant_name.charAt(0)}</span>
                    </div>
                )}

                {/* Dark gradient — stronger bottom half like TGTG */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 via-40% to-transparent" />

                {/* Back button — circle, semi-transparent */}
                <Link
                    href="/explore"
                    className="absolute left-4 top-4 z-20 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/90 shadow-sm focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                    style={{ marginTop: "env(safe-area-inset-top)" }}
                    aria-label="Retour"
                >
                    <ArrowLeft className="size-5 text-primary" />
                </Link>

                {/* Logo + name at bottom of cover — TGTG exact layout */}
                <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end px-4 pb-4">
                    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-[2.5px] border-white/90 bg-primary shadow-lg">
                        {profile.merchant_logo ? (
                            <Image
                                src={profile.merchant_logo}
                                alt={profile.merchant_name}
                                width={56}
                                height={56}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <span className="text-lg font-bold text-brand-secondary">{profile.merchant_name.charAt(0)}</span>
                        )}
                    </div>
                    <div className="ml-3 mb-0.5 min-w-0 flex-1">
                        <h1 className="font-heading text-[22px] font-bold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">{profile.merchant_name}</h1>
                        <ShopBadges shopId={profile.merchant_id} />
                    </div>
                </div>
            </div>

            {/* Info zone — clean beige below cover */}
            <div className="bg-secondary px-5 pt-4">
                {/* Address row — clickable like TGTG */}
                <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.merchant_address + ", " + profile.merchant_city)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 border-b border-secondary pb-3"
                >
                    <MarkerPin01 className="size-5 shrink-0 text-brand-secondary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-brand-secondary">{profile.merchant_address}, {profile.merchant_city}</p>
                        <p className="text-[11px] text-quaternary">Plus d&apos;informations sur le commerce</p>
                    </div>
                    <ChevronDown className="-rotate-90 size-5 text-quaternary" aria-hidden="true" />
                </a>

                {/* Stats + opening hours */}
                <div className="mt-3 flex items-center gap-2">
                    <p className="text-xs text-quaternary">
                        <span className="font-semibold text-primary">{profile.follower_count}</span> abonn&eacute;{profile.follower_count !== 1 ? "s" : ""}
                        {" · "}
                        <span className="font-semibold text-primary">{profile.product_count}</span> produit{profile.product_count !== 1 ? "s" : ""}
                    </p>
                    {(() => {
                        const status = getOpenStatus(profile.merchant_opening_hours);
                        if (!status) return null;
                        return (
                            <span className={cx(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                status.isOpen
                                    ? "bg-success-secondary text-success-primary"
                                    : "bg-error-secondary text-error-primary",
                            )}>
                                <Clock className="size-2.5" aria-hidden="true" />
                                {status.isOpen ? "Ouvert" : "Fermé"}
                            </span>
                        );
                    })()}
                </div>

                {/* S'abonner + Social links + Partager */}
                <div className="mt-3 flex items-center gap-2">
                    {/* S'abonner — flex-1 */}
                    <button
                        type="button"
                        onClick={() => merchantUuid && (isFollowing ? unfollow.mutate(merchantUuid) : follow.mutate(merchantUuid))}
                        className={cx(
                            "flex-1 min-h-[44px] rounded-lg text-[13px] font-semibold transition-colors active:scale-[0.97] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                            isFollowing
                                ? "border border-secondary bg-secondary text-tertiary"
                                : "bg-brand-solid text-white",
                        )}
                    >
                        {isFollowing ? "Abonné ✓" : "S'abonner"}
                    </button>

                    {/* Social icons — only shown if URL exists */}
                    {links.instagram && (
                        <a
                            href={links.instagram.startsWith("http") ? links.instagram : `https://instagram.com/${links.instagram.replace("@", "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-secondary bg-secondary_hover transition-colors active:scale-[0.97] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            aria-label="Instagram"
                        >
                            <Instagram size={18} className="text-tertiary" />
                        </a>
                    )}
                    {links.tiktok && (
                        <a
                            href={links.tiktok.startsWith("http") ? links.tiktok : `https://tiktok.com/@${links.tiktok.replace("@", "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-secondary bg-secondary_hover transition-colors active:scale-[0.97] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            aria-label="TikTok"
                        >
                            <TikTok size={18} className="text-tertiary" />
                        </a>
                    )}
                    {links.website && (
                        <a
                            href={links.website.startsWith("http") ? links.website : `https://${links.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-secondary bg-secondary_hover transition-colors active:scale-[0.97] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            aria-label="Site web"
                        >
                            <Globe02 className="size-[18px] text-tertiary" />
                        </a>
                    )}

                    {/* Partager */}
                    <button
                        type="button"
                        onClick={async () => {
                            const url = window.location.href;
                            if (navigator.share) {
                                try { await navigator.share({ title: profile.merchant_name, text: `Découvre ${profile.merchant_name} sur Two-Step`, url }); } catch {}
                            } else {
                                await navigator.clipboard.writeText(url);
                            }
                        }}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-secondary bg-secondary_hover transition-colors active:scale-[0.97] motion-reduce:transform-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                        aria-label="Partager"
                    >
                        <Share07 className="size-4 text-tertiary" />
                    </button>
                </div>

                {/* Opening hours detail */}
                <OpeningHoursSection hours={profile.merchant_opening_hours} />

                {/* Bio + links */}
                {profile.merchant_description && (
                    <p className="mt-4 text-sm leading-relaxed text-tertiary">{profile.merchant_description}</p>
                )}
            </div>

            {/* Sub-tabs */}
            <div className="mt-5 border-b border-secondary bg-secondary">
                <div className="flex px-5" role="tablist">
                    {SUB_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab}
                            tabIndex={activeTab === tab ? 0 : -1}
                            onClick={() => {
                                if (tab === "Avis") {
                                    setSuggestionOpen(true);
                                } else {
                                    setActiveTab(tab);
                                }
                            }}
                            className={cx(
                                "min-h-[44px] border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                                tab === "Avis"
                                    ? "border-transparent text-quaternary"
                                    : activeTab === tab
                                        ? "border-brand-solid text-brand-secondary"
                                        : "border-transparent text-quaternary",
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Product grid */}
            <div className="grid grid-cols-2 gap-3 p-4 pb-24">
                {filteredProducts.length === 0 ? (
                    <p className="col-span-2 py-12 text-center text-sm text-quaternary">
                        {activeTab === "Promos" ? "Aucune promo en cours" : "Aucun produit"}
                    </p>
                ) : (
                    filteredProducts.map((p) => (
                        <ProductCard
                            key={p.id}
                            compact
                            id={p.id}
                            name={p.canonical_name ?? p.name}
                            price={p.price}
                            photo={p.photo_processed_url ?? p.photo_url}
                            merchantName={profile.merchant_name}
                            distance={0}
                            stockQuantity={p.stock?.quantity ?? 0}
                            salePrice={promoMap.get(p.id) ?? null}
                            isFavorite={favoriteIds.has(p.id)}
                            onToggleFavorite={() => favoriteIds.has(p.id) ? remove.mutate(p.id) : add.mutate(p.id)}
                        />
                    ))
                )}
            </div>

            {/* Suggestion drawer (triggered by "Avis" tab) */}
            {merchantUuid && (
                <SuggestionDrawer open={suggestionOpen} onOpenChange={setSuggestionOpen} merchantId={merchantUuid} />
            )}
        </div>
    );
}

function OpeningHoursSection({ hours }: { hours: unknown }) {
    const [expanded, setExpanded] = useState(false);
    const status = getOpenStatus(hours);
    const weekly = formatWeeklyHours(hours);

    if (!status || weekly.length === 0) return null;

    return (
        <div className="mt-2">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="flex items-center gap-1.5 text-xs text-tertiary transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
                <Clock className="size-3" aria-hidden="true" />
                <span>{status.label}</span>
                <ChevronDown className={cx("size-3 transition duration-200", expanded && "rotate-180")} aria-hidden="true" />
            </button>
            {expanded && (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-primary/60 px-3 py-2.5">
                    {weekly.map((row) => (
                        <div key={row.day} className="flex justify-between text-[11px]">
                            <span className="font-medium text-primary">{row.day}</span>
                            <span className={cx(
                                row.hours === "Fermé" ? "text-error-primary" : "text-quaternary",
                            )}>{row.hours}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

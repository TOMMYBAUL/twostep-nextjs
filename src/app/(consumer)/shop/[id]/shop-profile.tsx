"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, LinkExternal01, MarkerPin01, Clock, ChevronDown, Share07 } from "@untitledui/icons";
import { useState, useEffect } from "react";
import { HeartButton } from "../../components/heart-button";
import { useFavorites, useToggleFavorite } from "../../hooks/use-favorites";
import { useFollows, useToggleFollow } from "../../hooks/use-follows";
import { getOpenStatus, formatWeeklyHours } from "../../lib/opening-hours";
import { cx } from "@/utils/cx";
import { generateSlug } from "@/lib/slug";
import { ShopBadges } from "@/components/shop/shop-badges";

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

const SUB_TABS = ["Catalogue", "Nouveautés", "Promos"];

export default function ShopProfileClient() {
    const { id } = useParams<{ id: string }>();
    const [activeTab, setActiveTab] = useState("Catalogue");

    const { data: profile } = useQuery<MerchantProfile>({
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
        if (activeTab === "Nouveautés") {
            const created = new Date(p.created_at);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return created >= thirtyDaysAgo;
        }
        if (activeTab === "Promos") {
            return promoMap.has(p.id);
        }
        return true;
    });

    if (!profile) {
        return (
            <div className="min-h-dvh bg-[var(--ts-cream)]">
                <div className="h-52 animate-pulse bg-white" />
                <div className="space-y-3 p-4">
                    <div className="h-6 w-48 animate-pulse rounded-xl bg-white" />
                    <div className="h-4 w-32 animate-pulse rounded-xl bg-white" />
                </div>
            </div>
        );
    }

    const links = profile.merchant_links ?? {};

    return (
        <div className="min-h-dvh bg-[var(--ts-cream)]">
            {/* Cover photo — TGTG style */}
            <div className="relative h-[45vh] min-h-[300px] max-h-[420px] w-full">
                {profile.merchant_cover ? (
                    <img src={profile.merchant_cover} alt="" className="h-full w-full object-cover" />
                ) : profile.merchant_photo ? (
                    <img src={profile.merchant_photo} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-[var(--ts-ochre)] to-[var(--ts-ochre-dark)]">
                        <span className="text-6xl font-bold text-white/30">{profile.merchant_name.charAt(0)}</span>
                    </div>
                )}

                {/* Dark gradient — stronger bottom half like TGTG */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 via-40% to-transparent" />

                {/* Back button — circle, semi-transparent */}
                <Link
                    href="/explore"
                    className="absolute left-4 top-4 z-20 flex size-11 items-center justify-center rounded-full bg-white/90 shadow-sm"
                    style={{ marginTop: "env(safe-area-inset-top)" }}
                    aria-label="Retour"
                >
                    <ArrowLeft className="size-5 text-[var(--ts-brown)]" />
                </Link>

                {/* Heart button — circle, top-right like TGTG */}
                <button
                    type="button"
                    onClick={() => merchantUuid && (isFollowing ? unfollow.mutate(merchantUuid) : follow.mutate(merchantUuid))}
                    className={cx(
                        "absolute right-4 top-4 z-20 flex size-11 items-center justify-center rounded-full shadow-sm",
                        isFollowing ? "bg-[var(--ts-ochre)] text-white" : "bg-white/90 text-[var(--ts-brown-mid)]",
                    )}
                    style={{ marginTop: "env(safe-area-inset-top)" }}
                    aria-label={isFollowing ? "Ne plus suivre" : "Suivre"}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isFollowing ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} className="size-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                </button>

                {/* Share button — below heart */}
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
                    className="absolute right-4 z-20 flex size-8 items-center justify-center rounded-full shadow-sm"
                    style={{ top: "calc(env(safe-area-inset-top) + 90px)", background: "rgba(13,9,4,0.5)" }}
                    aria-label="Partager"
                >
                    <Share07 className="size-3.5 text-[#f0dfc0]" />
                </button>

                {/* Logo + name at bottom of cover — TGTG exact layout */}
                <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end px-4 pb-4">
                    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-[2.5px] border-white/90 bg-white shadow-lg">
                        {profile.merchant_logo ? (
                            <img src={profile.merchant_logo} alt={profile.merchant_name} className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-lg font-bold text-[var(--ts-ochre)]">{profile.merchant_name.charAt(0)}</span>
                        )}
                    </div>
                    <div className="ml-3 mb-0.5 min-w-0 flex-1">
                        <h1 className="font-display text-[22px] font-bold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">{profile.merchant_name}</h1>
                        <ShopBadges shopId={profile.merchant_id} />
                    </div>
                </div>
            </div>

            {/* Info zone — clean beige below cover */}
            <div className="bg-[var(--ts-cream)] px-5 pt-4">
                {/* Address row — clickable like TGTG */}
                <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.merchant_address + ", " + profile.merchant_city)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 border-b border-[var(--ts-cream-dark)] pb-3"
                >
                    <MarkerPin01 className="size-5 shrink-0 text-[var(--ts-ochre)]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--ts-ochre)]">{profile.merchant_address}, {profile.merchant_city}</p>
                        <p className="text-[11px] text-[var(--ts-brown-mid)]/50">Plus d&apos;informations sur le commerce</p>
                    </div>
                    <ChevronDown className="-rotate-90 size-5 text-[var(--ts-brown-mid)]/40" aria-hidden="true" />
                </a>

                {/* Stats + opening hours */}
                <div className="mt-3 flex items-center gap-2">
                    <p className="text-xs text-[var(--ts-brown-mid)]/50">
                        <span className="font-semibold text-[var(--ts-brown)]">{profile.follower_count}</span> abonné{profile.follower_count !== 1 ? "s" : ""}
                        {" · "}
                        <span className="font-semibold text-[var(--ts-brown)]">{profile.product_count}</span> produit{profile.product_count !== 1 ? "s" : ""}
                    </p>
                    {(() => {
                        const status = getOpenStatus(profile.merchant_opening_hours);
                        if (!status) return null;
                        return (
                            <span className={cx(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                status.isOpen
                                    ? "bg-[var(--ts-sage)]/15 text-[var(--ts-sage)]"
                                    : "bg-[var(--ts-red)]/10 text-[var(--ts-red)]",
                            )}>
                                <Clock className="size-2.5" aria-hidden="true" />
                                {status.isOpen ? "Ouvert" : "Fermé"}
                            </span>
                        );
                    })()}
                </div>

                {/* Opening hours detail */}
                <OpeningHoursSection hours={profile.merchant_opening_hours} />

                {/* Bio + links */}
                {profile.merchant_description && (
                    <p className="mt-4 text-sm leading-relaxed text-[var(--ts-brown-mid)]/70">{profile.merchant_description}</p>
                )}
                {Object.keys(links).length > 0 && (
                    <div className="mt-3 flex gap-3">
                        {Object.entries(links).map(([platform, url]) => (
                            <a
                                key={platform}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-0.5 text-xs font-medium text-[var(--ts-ochre)] hover:underline"
                            >
                                {platform}
                                <LinkExternal01 className="size-3" aria-hidden="true" />
                            </a>
                        ))}
                    </div>
                )}
            </div>

            {/* Sub-tabs */}
            <div className="mt-5 border-b border-[var(--ts-cream-dark)] bg-[var(--ts-cream)]">
                <div className="flex px-5">
                    {SUB_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={cx(
                                "border-b-2 px-4 py-3 text-sm font-semibold transition duration-150",
                                activeTab === tab
                                    ? "border-[var(--ts-ochre)] text-[var(--ts-ochre)]"
                                    : "border-transparent text-[var(--ts-brown-mid)]/40",
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
                    <p className="col-span-2 py-12 text-center text-sm text-[var(--ts-brown-mid)]/40">
                        {activeTab === "Promos" ? "Aucune promo en cours" : activeTab === "Nouveautés" ? "Pas de nouveautés récentes" : "Aucun produit"}
                    </p>
                ) : (
                    filteredProducts.map((p) => {
                        const sale = promoMap.get(p.id) ?? null;
                        const isFav = favoriteIds.has(p.id);
                        const isOut = (p.stock?.quantity ?? 0) === 0;
                        return (
                            <Link key={p.id} href={`/product/${generateSlug(p.name, p.id)}`} className="group block">
                                {/* Photo */}
                                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[var(--ts-cream-dark)]">
                                    {(p.photo_processed_url ?? p.photo_url) ? (
                                        <img
                                            src={p.photo_processed_url ?? p.photo_url ?? "/placeholder-product.svg"}
                                            alt={p.name}
                                            className={cx(
                                                "h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]",
                                                isOut && "opacity-40",
                                            )}
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center">
                                            <span className="text-3xl font-light text-[var(--ts-brown-mid)]/15">{p.name.charAt(0)}</span>
                                        </div>
                                    )}

                                    <div className="absolute right-2 top-2">
                                        <HeartButton
                                            isFavorite={isFav}
                                            onToggle={() => isFav ? remove.mutate(p.id) : add.mutate(p.id)}
                                            ariaLabel={`${isFav ? "Retirer" : "Ajouter"} ${p.name} des favoris`}
                                            className="bg-white/80 backdrop-blur-sm"
                                        />
                                    </div>

                                    {sale && (
                                        <div className="absolute bottom-2 left-2 rounded-md bg-[var(--ts-ochre)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                            -{Math.round(((p.price - sale) / p.price) * 100)}%
                                        </div>
                                    )}

                                    {isOut && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="rounded-lg px-2.5 py-[5px] text-[11px] font-medium text-[#e8d4b0]" style={{ background: "rgba(0,0,0,0.55)" }}>Indisponible</span>
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="mt-2 px-0.5">
                                    <p className="truncate text-[13px] font-medium text-[var(--ts-brown)]">{p.name}</p>
                                    <div className="mt-0.5 flex items-baseline gap-2">
                                        {sale ? (
                                            <>
                                                <span className="text-xs font-normal text-[#a07840]">{sale.toFixed(2)} €</span>
                                                <span className="text-[11px] text-[#5a3a18]/60 line-through">{p.price.toFixed(2)} €</span>
                                            </>
                                        ) : (
                                            <span className="text-xs font-normal text-[#a07840]">{p.price.toFixed(2)} €</span>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })
                )}
            </div>
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
                className="flex items-center gap-1.5 text-xs text-[var(--ts-brown-mid)]/60 transition duration-100 hover:text-[var(--ts-brown)]"
            >
                <Clock className="size-3" aria-hidden="true" />
                <span>{status.label}</span>
                <ChevronDown className={cx("size-3 transition duration-200", expanded && "rotate-180")} aria-hidden="true" />
            </button>
            {expanded && (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-white/60 px-3 py-2.5">
                    {weekly.map((row) => (
                        <div key={row.day} className="flex justify-between text-[11px]">
                            <span className="font-medium text-[var(--ts-brown)]">{row.day}</span>
                            <span className={cx(
                                row.hours === "Fermé" ? "text-[var(--ts-red)]/60" : "text-[var(--ts-brown-mid)]/50",
                            )}>{row.hours}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

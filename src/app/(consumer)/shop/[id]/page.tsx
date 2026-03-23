"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, LinkExternal01, MarkerPin01 } from "@untitledui/icons";
import { useState } from "react";
import { ProductCard } from "../../components/product-card";
import { useFavorites, useToggleFavorite } from "../../hooks/use-favorites";
import { useFollows, useToggleFollow } from "../../hooks/use-follows";
import { cx } from "@/utils/cx";

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
    category: string | null;
    stock: { quantity: number }[];
}

const SUB_TABS = ["Catalogue", "Nouveautés", "Promos"];

export default function ShopProfilePage() {
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

    const { data: favorites } = useFavorites();
    const { add, remove } = useToggleFavorite();
    const { data: follows } = useFollows();
    const { follow, unfollow } = useToggleFollow();

    const favoriteIds = new Set(favorites?.map((f) => f.product_id) ?? []);
    const isFollowing = follows?.some((f) => f.merchant_id === id) ?? false;

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
            {/* Cover photo */}
            <div className="relative h-52 w-full overflow-hidden">
                {profile.merchant_cover ? (
                    <img src={profile.merchant_cover} alt="" className="h-full w-full object-cover" />
                ) : profile.merchant_photo ? (
                    <img src={profile.merchant_photo} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-[var(--ts-ochre)] to-[var(--ts-ochre-dark)]">
                        <span className="text-6xl font-bold text-white/30">{profile.merchant_name.charAt(0)}</span>
                    </div>
                )}
                <Link
                    href="/explore"
                    className="absolute left-4 top-4 flex size-10 items-center justify-center rounded-xl bg-white/80 shadow-sm backdrop-blur-sm"
                    style={{ marginTop: "env(safe-area-inset-top)" }}
                    aria-label="Retour"
                >
                    <ArrowLeft className="size-5 text-[var(--ts-brown)]" />
                </Link>
            </div>

            {/* Profile info — overlaps cover */}
            <div className="-mt-6 rounded-t-3xl bg-[var(--ts-cream)] px-5 pt-1">
                {/* Logo + name */}
                <div className="-mt-8 flex items-end gap-3">
                    <div className="flex size-18 items-center justify-center overflow-hidden rounded-2xl border-[3px] border-[var(--ts-cream)] bg-white shadow-md">
                        {profile.merchant_logo ? (
                            <img src={profile.merchant_logo} alt={profile.merchant_name} className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-2xl font-bold text-[var(--ts-ochre)]">{profile.merchant_name.charAt(0)}</span>
                        )}
                    </div>
                    <div className="pb-1 flex-1 min-w-0">
                        <h1 className="truncate font-display text-lg font-bold text-[var(--ts-brown)]">{profile.merchant_name}</h1>
                        <p className="flex items-center gap-1 text-[11px] text-[var(--ts-brown-mid)]/50">
                            <MarkerPin01 className="size-3" aria-hidden="true" />
                            {profile.merchant_address}, {profile.merchant_city}
                        </p>
                    </div>
                </div>

                {/* Stats */}
                <p className="mt-3 text-xs text-[var(--ts-brown-mid)]/50">
                    <span className="font-semibold text-[var(--ts-brown)]">{profile.follower_count}</span> abonné{profile.follower_count !== 1 ? "s" : ""}
                    {" · "}
                    <span className="font-semibold text-[var(--ts-brown)]">{profile.product_count}</span> produit{profile.product_count !== 1 ? "s" : ""}
                </p>

                {/* Action buttons */}
                <div className="mt-4 flex gap-3">
                    <button
                        type="button"
                        onClick={() => isFollowing ? unfollow.mutate(id) : follow.mutate(id)}
                        className={cx(
                            "flex-1 rounded-2xl py-3 text-sm font-bold transition duration-150",
                            isFollowing
                                ? "border-2 border-[var(--ts-cream-dark)] bg-white text-[var(--ts-brown-mid)]"
                                : "bg-[var(--ts-ochre)] text-white shadow-sm",
                        )}
                    >
                        {isFollowing ? "Suivi ✓" : "Suivre"}
                    </button>
                    <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.merchant_address + ", " + profile.merchant_city)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-2xl border-2 border-[var(--ts-cream-dark)] bg-white px-5 py-3 text-sm font-semibold text-[var(--ts-brown)] transition duration-150 active:bg-[var(--ts-cream)]"
                    >
                        <MarkerPin01 className="size-4" aria-hidden="true" />
                        Itinéraire
                    </a>
                </div>

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
                {(products ?? []).map((p) => (
                    <ProductCard
                        key={p.id}
                        id={p.id}
                        name={p.name}
                        price={p.price}
                        photo={p.photo_url}
                        merchantName={profile.merchant_name}
                        distance={0}
                        stockQuantity={p.stock?.[0]?.quantity ?? 0}
                        isFavorite={favoriteIds.has(p.id)}
                        onToggleFavorite={() => {
                            if (favoriteIds.has(p.id)) {
                                remove.mutate(p.id);
                            } else {
                                add.mutate(p.id);
                            }
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

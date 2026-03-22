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
            <div className="space-y-4 p-4">
                <div className="h-48 animate-pulse rounded-2xl bg-secondary" />
                <div className="h-6 w-48 animate-pulse rounded bg-secondary" />
            </div>
        );
    }

    const links = profile.merchant_links ?? {};

    return (
        <div className="pb-4">
            {/* Cover photo */}
            <div className="relative h-48 w-full overflow-hidden bg-tertiary">
                {profile.merchant_cover ? (
                    <img src={profile.merchant_cover} alt="" className="h-full w-full object-cover" />
                ) : profile.merchant_photo ? (
                    <img src={profile.merchant_photo} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-[var(--ts-ochre)] to-[var(--ts-cream)]">
                        <span className="text-5xl font-bold text-white">{profile.merchant_name.charAt(0)}</span>
                    </div>
                )}
                <Link
                    href="/explore"
                    className="absolute left-3 top-3 flex size-8 items-center justify-center rounded-full bg-primary/80 backdrop-blur-sm"
                    aria-label="Retour"
                >
                    <ArrowLeft className="size-4 text-primary" />
                </Link>
            </div>

            {/* Profile info */}
            <div className="px-4">
                {/* Logo + name */}
                <div className="-mt-8 flex items-end gap-3">
                    <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-secondary shadow-md">
                        {profile.merchant_logo ? (
                            <img src={profile.merchant_logo} alt={profile.merchant_name} className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-xl font-bold text-quaternary">{profile.merchant_name.charAt(0)}</span>
                        )}
                    </div>
                    <div className="pb-1">
                        <h1 className="text-lg font-bold text-primary">{profile.merchant_name}</h1>
                        <p className="flex items-center gap-1 text-xs text-tertiary">
                            <MarkerPin01 className="size-3" aria-hidden="true" />
                            {profile.merchant_address}, {profile.merchant_city}
                        </p>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="mt-4 flex gap-3">
                    <button
                        type="button"
                        onClick={() => isFollowing ? unfollow.mutate(id) : follow.mutate(id)}
                        className={cx(
                            "flex-1 rounded-xl py-2.5 text-sm font-semibold transition duration-100",
                            isFollowing
                                ? "border border-secondary bg-primary text-secondary"
                                : "bg-[var(--ts-ochre)] text-white",
                        )}
                    >
                        {isFollowing ? "Suivi ✓" : "Suivre"}
                    </button>
                    <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.merchant_address + ", " + profile.merchant_city)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-xl border border-secondary px-4 py-2.5 text-sm font-medium text-secondary transition duration-100 hover:bg-secondary"
                    >
                        <MarkerPin01 className="size-4" aria-hidden="true" />
                        Itinéraire
                    </a>
                </div>

                {/* Bio + stats */}
                <div className="mt-4">
                    {profile.merchant_description && (
                        <p className="text-sm text-secondary">{profile.merchant_description}</p>
                    )}
                    {Object.keys(links).length > 0 && (
                        <div className="mt-2 flex gap-3">
                            {Object.entries(links).map(([platform, url]) => (
                                <a
                                    key={platform}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-[var(--ts-ochre)] hover:underline"
                                >
                                    {platform}
                                    <LinkExternal01 className="ml-0.5 inline size-3" aria-hidden="true" />
                                </a>
                            ))}
                        </div>
                    )}
                    <p className="mt-2 text-xs text-tertiary">
                        {profile.follower_count} abonné{profile.follower_count !== 1 ? "s" : ""} · {profile.product_count} produit{profile.product_count !== 1 ? "s" : ""} disponible{profile.product_count !== 1 ? "s" : ""}
                    </p>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="mt-4 border-b border-secondary">
                <div className="flex px-4">
                    {SUB_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={cx(
                                "border-b-2 px-4 py-2.5 text-sm font-medium transition duration-100",
                                activeTab === tab
                                    ? "border-[var(--ts-ochre)] text-[var(--ts-ochre)]"
                                    : "border-transparent text-tertiary hover:text-secondary",
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Product grid */}
            <div className="mt-4 grid grid-cols-2 gap-3 px-4">
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

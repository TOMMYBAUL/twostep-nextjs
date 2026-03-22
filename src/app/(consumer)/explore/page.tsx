"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { FilterLines } from "@untitledui/icons";
import { BottomSheet } from "../components/bottom-sheet";
import { MapView } from "../components/map-view";
import { ShopCard } from "../components/shop-card";
import { useGeolocation } from "../hooks/use-geolocation";
import { cx } from "@/utils/cx";

const CATEGORIES = ["Mode", "Tech", "Sport", "Maison", "Alimentation"];

interface NearbyMerchant {
    merchant_id: string;
    merchant_name: string;
    merchant_description: string | null;
    merchant_photo: string | null;
    merchant_logo: string | null;
    merchant_address: string;
    merchant_city: string;
    merchant_lat: number;
    merchant_lng: number;
    distance_km: number;
    product_count: number;
    promo_count: number;
}

export default function ExplorePage() {
    const { position } = useGeolocation();
    const [category, setCategory] = useState<string | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        if (!filterOpen) return;
        const handler = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [filterOpen]);

    const { data, isLoading } = useQuery<NearbyMerchant[]>({
        queryKey: ["merchants-nearby", position?.lat, position?.lng, category],
        queryFn: async () => {
            const params = new URLSearchParams({
                lat: position!.lat.toString(),
                lng: position!.lng.toString(),
                radius: "10",
            });
            if (category) params.set("category", category.toLowerCase());
            const res = await fetch(`/api/merchants/nearby?${params}`);
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            return json.merchants;
        },
        enabled: !!position,
    });

    const merchants = data ?? [];

    return (
        <div className="relative h-[calc(100dvh-4rem)]">
            <div className="absolute inset-0">
                <MapView merchants={merchants} userPosition={position} className="h-full w-full" />
            </div>

            {/* Filter button — top right on map */}
            <div ref={filterRef} className="absolute right-3 top-3 z-10">
                <button
                    type="button"
                    onClick={() => setFilterOpen((v) => !v)}
                    className={cx(
                        "flex items-center gap-1.5 rounded-full border border-white/60 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-md transition duration-100",
                        category
                            ? "bg-[var(--ts-ochre)] text-white"
                            : "bg-white/80 text-primary",
                    )}
                >
                    <FilterLines className="size-3.5" aria-hidden="true" />
                    {category ?? "Filtrer"}
                </button>
                {filterOpen && (
                    <div className="mt-1.5 overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                        <button
                            type="button"
                            onClick={() => { setCategory(null); setFilterOpen(false); }}
                            className={cx(
                                "w-full px-4 py-2.5 text-left text-xs font-medium transition duration-100",
                                !category ? "bg-[var(--ts-ochre)]/10 text-[var(--ts-ochre)]" : "text-secondary hover:bg-secondary",
                            )}
                        >
                            Toutes catégories
                        </button>
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => { setCategory(cat); setFilterOpen(false); }}
                                className={cx(
                                    "w-full px-4 py-2.5 text-left text-xs font-medium transition duration-100",
                                    category === cat ? "bg-[var(--ts-ochre)]/10 text-[var(--ts-ochre)]" : "text-secondary hover:bg-secondary",
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <BottomSheet>
                <div className="space-y-3 px-4 pb-4">
                    {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-48 animate-pulse rounded-2xl bg-secondary" />
                        ))
                    ) : merchants.length === 0 ? (
                        <p className="py-8 text-center text-sm text-tertiary">Aucune boutique trouvée à proximité</p>
                    ) : (
                        merchants.map((m) => (
                            <ShopCard
                                key={m.merchant_id}
                                id={m.merchant_id}
                                name={m.merchant_name}
                                description={m.merchant_description}
                                photo={m.merchant_photo}
                                address={m.merchant_address}
                                distance={m.distance_km}
                                productCount={m.product_count}
                                promoCount={m.promo_count}
                            />
                        ))
                    )}
                </div>
            </BottomSheet>
        </div>
    );
}

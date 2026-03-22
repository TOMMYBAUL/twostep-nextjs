"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BottomSheet } from "../components/bottom-sheet";
import { FilterPills } from "../components/filter-pills";
import { MapView } from "../components/map-view";
import { ShopCard } from "../components/shop-card";
import { useGeolocation } from "../hooks/use-geolocation";

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
            <BottomSheet>
                <FilterPills options={CATEGORIES} selected={category} onSelect={setCategory} />
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

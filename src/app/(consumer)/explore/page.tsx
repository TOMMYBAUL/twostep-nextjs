"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { MarkerPin01, SearchMd, XClose, ChevronRight, Tag01, Clock } from "@untitledui/icons";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MapView } from "../components/map-view";
import { BottomSheet } from "../components/bottom-sheet";
import { useGeolocation } from "../hooks/use-geolocation";
import { useAutocomplete } from "../hooks/use-search";
import { cx } from "@/utils/cx";

const CATEGORIES = [
    { label: "Tout", value: null, emoji: "" },
    { label: "Mode", value: "mode", emoji: "👗" },
    { label: "Chaussures", value: "chaussures", emoji: "👟" },
    { label: "Sport", value: "sport", emoji: "⚽" },
    { label: "Tech", value: "tech", emoji: "📱" },
    { label: "Beauté", value: "beaute", emoji: "💄" },
    { label: "Bijoux", value: "bijoux", emoji: "💍" },
    { label: "Jouets", value: "jouets", emoji: "🧸" },
] as const;

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

function walkingMinutes(km: number): number {
    return Math.max(1, Math.round(km / 0.08)); // ~5km/h = 83m/min
}

export default function ExplorePage() {
    const router = useRouter();
    const { position } = useGeolocation();
    const [category, setCategory] = useState<string | null>(null);
    const [recenterTrigger, setRecenterTrigger] = useState(0);
    const [is3D, setIs3D] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const [selectedMerchant, setSelectedMerchant] = useState<NearbyMerchant | null>(null);

    const { data: suggestions } = useAutocomplete(searchFocused ? searchQuery : "");

    const handleSearch = (q: string) => {
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    };

    const { data, isLoading } = useQuery<NearbyMerchant[]>({
        queryKey: ["merchants-nearby", position?.lat, position?.lng, category],
        queryFn: async () => {
            const params = new URLSearchParams({
                lat: position!.lat.toString(),
                lng: position!.lng.toString(),
                radius: "10",
            });
            if (category) params.set("category", category);
            const res = await fetch(`/api/nearby?${params}`);
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            return json.merchants;
        },
        enabled: !!position,
    });

    const merchants = data ?? [];

    // Max distance for contextual text
    const maxDist = merchants.length > 0 ? Math.max(...merchants.map(m => m.distance_km)) : 0;
    const distLabel = maxDist < 1 ? `${Math.round(maxDist * 1000)}m` : `${Math.ceil(maxDist)}km`;

    // Dismiss mini-fiche when clicking elsewhere on map
    useEffect(() => {
        const handler = () => setSelectedMerchant(null);
        const map = document.querySelector("[class*='mapboxgl-canvas']");
        map?.addEventListener("click", handler);
        return () => map?.removeEventListener("click", handler);
    }, []);

    return (
        <div className="relative h-[calc(100dvh-4rem)]">
            <div className="absolute inset-0">
                <MapView
                    merchants={merchants}
                    userPosition={position}
                    className="h-full w-full"
                    recenterTrigger={recenterTrigger}
                    is3D={is3D}
                    selectedMerchantId={selectedMerchant?.merchant_id ?? null}
                    onMerchantSelect={(m) => setSelectedMerchant(m as NearbyMerchant)}
                />
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-[var(--ts-cream)] to-transparent" />
            </div>

            {/* Search bar — top */}
            <div className="absolute left-0 right-0 top-3 z-10 px-4">
                <div className="mx-auto max-w-md">
                    <div className="relative">
                        <div className={cx(
                            "flex items-center gap-2.5 rounded-2xl px-4 py-3 shadow-lg backdrop-blur-md transition-all duration-200",
                            searchFocused ? "bg-white shadow-xl ring-2 ring-[var(--ts-ochre)]/20" : "bg-white/95",
                        )}>
                            <SearchMd className="size-[18px] shrink-0 text-[var(--ts-brown-mid)]/40" aria-hidden="true" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setSearchFocused(true)}
                                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(searchQuery); }}
                                placeholder="Trouver un produit, une marque..."
                                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ts-brown)] outline-none placeholder:text-[var(--ts-brown-mid)]/30"
                            />
                            {searchQuery && (
                                <button type="button" onClick={() => setSearchQuery("")} className="text-[var(--ts-brown-mid)]/30 hover:text-[var(--ts-brown-mid)]">
                                    <XClose className="size-4" />
                                </button>
                            )}
                        </div>
                        {searchFocused && suggestions && suggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white shadow-xl">
                                {suggestions.map((s, i) => (
                                    <button
                                        key={`${s.suggestion_type}-${s.suggestion}-${i}`}
                                        type="button"
                                        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-[var(--ts-brown)] transition duration-100 hover:bg-[var(--ts-cream)]/50"
                                        onMouseDown={(e) => { e.preventDefault(); handleSearch(s.suggestion); }}
                                    >
                                        <span className="rounded-lg bg-[var(--ts-cream)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ts-brown-mid)]">
                                            {s.suggestion_type === "product" ? "Produit" : s.suggestion_type === "brand" ? "Marque" : "Catégorie"}
                                        </span>
                                        {s.suggestion}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Category filter chips — always visible */}
                    <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.label}
                                type="button"
                                onClick={() => { setCategory(cat.value); setSelectedMerchant(null); }}
                                className={cx(
                                    "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-sm transition duration-150",
                                    category === cat.value
                                        ? "bg-[var(--ts-ochre)] text-white shadow-md"
                                        : "bg-white/90 text-[var(--ts-brown)] active:bg-white",
                                )}
                            >
                                {cat.emoji && <span>{cat.emoji}</span>}
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Map controls — right side */}
            <div className="absolute bottom-44 right-3 z-10 flex flex-col gap-2">
                <button
                    type="button"
                    onClick={() => setIs3D((v) => !v)}
                    className={cx(
                        "flex size-11 items-center justify-center rounded-xl shadow-lg backdrop-blur-sm transition duration-150 active:scale-95",
                        is3D ? "bg-[var(--ts-ochre)] text-white" : "bg-white/95 text-[var(--ts-brown)]",
                    )}
                    aria-label={is3D ? "Vue 2D" : "Vue 3D"}
                >
                    <span className="text-xs font-bold">3D</span>
                </button>
                <button
                    type="button"
                    onClick={() => setRecenterTrigger((n) => n + 1)}
                    className="flex size-11 items-center justify-center rounded-xl bg-white/95 shadow-lg backdrop-blur-sm transition duration-150 active:scale-95"
                    aria-label="Recentrer"
                >
                    <MarkerPin01 className="size-5 text-[var(--ts-ochre)]" aria-hidden="true" />
                </button>
            </div>

            {/* Mini-fiche — appears when a pin is tapped */}
            {selectedMerchant && (
                <div className="absolute bottom-40 left-4 right-4 z-30 mx-auto max-w-md animate-in slide-in-from-bottom-4 fade-in duration-200">
                    <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
                        <div className="flex items-center gap-3 p-4">
                            {/* Avatar */}
                            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--ts-cream)] shadow-sm">
                                {selectedMerchant.merchant_photo || selectedMerchant.merchant_logo ? (
                                    <img src={selectedMerchant.merchant_logo || selectedMerchant.merchant_photo || ""} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="text-lg font-bold text-[var(--ts-ochre)]">
                                        {selectedMerchant.merchant_name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                                    </span>
                                )}
                            </div>

                            {/* Info */}
                            <div className="min-w-0 flex-1">
                                <h3 className="truncate text-sm font-bold text-[var(--ts-brown)]">{selectedMerchant.merchant_name}</h3>
                                <p className="mt-0.5 truncate text-xs text-[var(--ts-brown-mid)]/60">{selectedMerchant.merchant_address}</p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                    <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--ts-sage)]">
                                        <Clock className="size-3" aria-hidden="true" />
                                        {walkingMinutes(selectedMerchant.distance_km)} min à pied
                                    </span>
                                    <span className="text-[11px] font-medium text-[var(--ts-brown-mid)]/40">·</span>
                                    <span className="text-[11px] font-medium text-[var(--ts-brown-mid)]/60">
                                        {selectedMerchant.product_count} produit{selectedMerchant.product_count > 1 ? "s" : ""} en stock
                                    </span>
                                    {selectedMerchant.promo_count > 0 && (
                                        <>
                                            <span className="text-[11px] font-medium text-[var(--ts-brown-mid)]/40">·</span>
                                            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-[var(--ts-red)]">
                                                <Tag01 className="size-2.5" aria-hidden="true" />
                                                {selectedMerchant.promo_count} promo{selectedMerchant.promo_count > 1 ? "s" : ""}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* CTA */}
                            <Link
                                href={`/shop/${selectedMerchant.merchant_id}`}
                                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ts-ochre)] text-white shadow-sm transition duration-150 active:scale-95"
                            >
                                <ChevronRight className="size-5" />
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom sheet — merchant list */}
            <BottomSheet merchants={merchants} isLoading={isLoading} distLabel={distLabel} />
        </div>
    );
}

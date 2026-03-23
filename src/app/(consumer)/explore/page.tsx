"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { FilterLines, MarkerPin01, SearchMd, XClose, Check } from "@untitledui/icons";
import { useRouter } from "next/navigation";
import { MapView } from "../components/map-view";
import { BottomSheet } from "../components/bottom-sheet";
import { useGeolocation } from "../hooks/use-geolocation";
import { useAutocomplete } from "../hooks/use-search";
import { cx } from "@/utils/cx";

const CATEGORIES = ["Mode", "Tech", "Sport", "Maison", "Beauté"];

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
    const router = useRouter();
    const { position } = useGeolocation();
    const [category, setCategory] = useState<string | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [openNow, setOpenNow] = useState(false);
    const [recenterTrigger, setRecenterTrigger] = useState(0);
    const [is3D, setIs3D] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    const { data: suggestions } = useAutocomplete(searchFocused ? searchQuery : "");

    const handleSearch = (q: string) => {
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    };

    useEffect(() => {
        if (!filterOpen) return;
        const handler = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [filterOpen]);

    const { data, isLoading } = useQuery<NearbyMerchant[]>({
        queryKey: ["merchants-nearby", position?.lat, position?.lng, category, openNow],
        queryFn: async () => {
            const params = new URLSearchParams({
                lat: position!.lat.toString(),
                lng: position!.lng.toString(),
                radius: "10",
            });
            if (category) params.set("category", category.toLowerCase());
            if (openNow) params.set("open_now", "true");
            const res = await fetch(`/api/nearby?${params}`);
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
                <MapView merchants={merchants} userPosition={position} className="h-full w-full" recenterTrigger={recenterTrigger} is3D={is3D} />
                {/* Gradient fade — blends map edge into bottom sheet */}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-[var(--ts-cream)] to-transparent" />
            </div>

            {/* Search bar + filter — top */}
            <div className="absolute left-0 right-0 top-3 z-10 px-4">
                <div className="mx-auto flex max-w-md items-center gap-2">
                    {/* Search input */}
                    <div className="relative flex-1">
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
                                placeholder="Trouver un produit..."
                                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ts-brown)] outline-none placeholder:text-[var(--ts-brown-mid)]/30"
                            />
                            {!searchFocused && !searchQuery && merchants.length > 0 && (
                                <span className="shrink-0 rounded-full bg-[var(--ts-cream)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ts-brown-mid)]/60">
                                    {merchants.length}
                                </span>
                            )}
                            {searchQuery && (
                                <button type="button" onClick={() => setSearchQuery("")} className="text-[var(--ts-brown-mid)]/30 hover:text-[var(--ts-brown-mid)]">
                                    <XClose className="size-4" />
                                </button>
                            )}
                        </div>
                        {searchFocused && (
                            <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white shadow-xl">
                                {!searchQuery && (
                                    <div className="flex flex-wrap gap-2 px-4 pt-3 pb-2">
                                        {CATEGORIES.map((cat) => (
                                            <button
                                                key={cat}
                                                type="button"
                                                className="rounded-full bg-[var(--ts-cream)] px-3 py-1.5 text-xs font-semibold text-[var(--ts-brown)] transition duration-100 active:bg-[var(--ts-cream-dark)]"
                                                onMouseDown={(e) => { e.preventDefault(); handleSearch(cat); }}
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {suggestions && suggestions.length > 0 && (
                                    <div className={!searchQuery ? "border-t border-[var(--ts-cream)]" : ""}>
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
                                {!searchQuery && (!suggestions || suggestions.length === 0) && (
                                    <p className="px-4 pb-3 text-[11px] text-[var(--ts-brown-mid)]/40">
                                        Cherche un produit, une marque ou une catégorie
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Filter button — inline with search */}
                    <div ref={filterRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setFilterOpen((v) => !v)}
                            className={cx(
                                "flex size-12 items-center justify-center rounded-2xl shadow-lg backdrop-blur-md transition duration-150",
                                category || openNow
                                    ? "bg-[var(--ts-ochre)] text-white"
                                    : "bg-white/95 text-[var(--ts-brown)]",
                            )}
                            aria-label="Filtrer"
                        >
                            <FilterLines className="size-5" aria-hidden="true" />
                        </button>
                        {filterOpen && (
                            <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl bg-white shadow-xl">
                                <button
                                    type="button"
                                    onClick={() => { setCategory(null); setFilterOpen(false); }}
                                    className={cx(
                                        "w-full px-4 py-3 text-left text-xs font-medium transition duration-100",
                                        !category ? "bg-[var(--ts-ochre)]/10 text-[var(--ts-ochre)]" : "text-[var(--ts-brown-mid)] hover:bg-[var(--ts-cream)]/50",
                                    )}
                                >
                                    Toutes catégories
                                </button>
                                <div className="border-t border-[var(--ts-cream)]">
                                    <button
                                        type="button"
                                        onClick={() => setOpenNow((v) => !v)}
                                        className={cx(
                                            "flex w-full items-center justify-between px-4 py-3 text-xs font-medium transition duration-100",
                                            openNow ? "text-[var(--ts-ochre)]" : "text-[var(--ts-brown-mid)] hover:bg-[var(--ts-cream)]/50",
                                        )}
                                    >
                                        Ouvert maintenant
                                        <div className={cx(
                                            "flex size-5 items-center justify-center rounded-lg border-2 transition duration-100",
                                            openNow ? "border-[var(--ts-ochre)] bg-[var(--ts-ochre)]" : "border-gray-200",
                                        )}>
                                            {openNow && <Check className="size-3 text-white" />}
                                        </div>
                                    </button>
                                </div>
                                <div className="border-t border-[var(--ts-cream)]">
                                    {CATEGORIES.map((cat) => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => { setCategory(cat); setFilterOpen(false); }}
                                            className={cx(
                                                "w-full px-4 py-3 text-left text-xs font-medium transition duration-100",
                                                category === cat ? "bg-[var(--ts-ochre)]/10 text-[var(--ts-ochre)]" : "text-[var(--ts-brown-mid)] hover:bg-[var(--ts-cream)]/50",
                                            )}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Map controls — stacked right */}
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
                    aria-label="Recentrer sur ma position"
                >
                    <MarkerPin01 className="size-5 text-[var(--ts-ochre)]" aria-hidden="true" />
                </button>
            </div>

            {/* Bottom sheet — replaces side panel */}
            <BottomSheet merchants={merchants} isLoading={isLoading} />
        </div>
    );
}

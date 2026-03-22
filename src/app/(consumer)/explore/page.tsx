"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { FilterLines, MarkerPin01, SearchMd, XClose, Check } from "@untitledui/icons";
import { useRouter } from "next/navigation";
import { MapView } from "../components/map-view";
import { SidePanel } from "../components/side-panel";
import { useGeolocation } from "../hooks/use-geolocation";
import { useAutocomplete } from "../hooks/use-search";
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
        queryKey: ["merchants-nearby", position?.lat, position?.lng, category, openNow],
        queryFn: async () => {
            const params = new URLSearchParams({
                lat: position!.lat.toString(),
                lng: position!.lng.toString(),
                radius: "10",
            });
            if (category) params.set("category", category.toLowerCase());
            if (openNow) params.set("open_now", "true");
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
                <MapView merchants={merchants} userPosition={position} className="h-full w-full" recenterTrigger={recenterTrigger} is3D={is3D} />
            </div>

            {/* Search bar — top center on map */}
            <div className="absolute left-1/2 top-3 z-10 w-full max-w-sm -translate-x-1/2 px-16 sm:px-4">
                <div className="relative">
                    <div className={cx(
                        "flex items-center gap-2 rounded-full px-4 py-2 shadow-lg backdrop-blur-md transition-all duration-200",
                        searchFocused ? "bg-white shadow-xl ring-2 ring-[var(--ts-ochre)]/30" : "bg-white/90",
                    )}>
                        <SearchMd className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(searchQuery); }}
                            placeholder="Rechercher un produit..."
                            className="min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-placeholder"
                        />
                        {!searchFocused && !searchQuery && merchants.length > 0 && (
                            <span className="shrink-0 text-[11px] font-medium text-tertiary">
                                {merchants.length} boutique{merchants.length !== 1 ? "s" : ""}
                            </span>
                        )}
                        {searchQuery && (
                            <button type="button" onClick={() => setSearchQuery("")} className="text-quaternary hover:text-secondary">
                                <XClose className="size-3.5" />
                            </button>
                        )}
                    </div>
                    {searchFocused && suggestions && suggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                            {suggestions.map((s, i) => (
                                <button
                                    key={`${s.suggestion_type}-${s.suggestion}-${i}`}
                                    type="button"
                                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-primary hover:bg-secondary"
                                    onMouseDown={(e) => { e.preventDefault(); handleSearch(s.suggestion); }}
                                >
                                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-tertiary">
                                        {s.suggestion_type === "product" ? "Produit" : s.suggestion_type === "brand" ? "Marque" : "Catégorie"}
                                    </span>
                                    {s.suggestion}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
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
                    {category ?? (openNow ? "Ouvert" : "Filtrer")}
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
                        <div className="border-t border-secondary">
                            <button
                                type="button"
                                onClick={() => setOpenNow((v) => !v)}
                                className={cx(
                                    "flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium transition duration-100",
                                    openNow ? "text-[var(--ts-ochre)]" : "text-secondary hover:bg-secondary",
                                )}
                            >
                                Ouvert maintenant
                                <div className={cx(
                                    "flex size-4 items-center justify-center rounded-full border transition duration-100",
                                    openNow ? "border-[var(--ts-ochre)] bg-[var(--ts-ochre)]" : "border-tertiary",
                                )}>
                                    {openNow && <Check className="size-2.5 text-white" />}
                                </div>
                            </button>
                        </div>
                        <div className="border-t border-secondary">
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
                    </div>
                )}
            </div>

            {/* 3D toggle — bottom right on map, above recenter */}
            <button
                type="button"
                onClick={() => setIs3D((v) => !v)}
                className={cx(
                    "absolute bottom-16 right-3 z-10 flex size-10 items-center justify-center rounded-full shadow-lg backdrop-blur-sm transition duration-100 hover:bg-white active:scale-95",
                    is3D ? "bg-[var(--ts-ochre)] text-white" : "bg-white/90 text-primary",
                )}
                aria-label={is3D ? "Vue 2D" : "Vue 3D"}
            >
                <span className="text-xs font-bold">3D</span>
            </button>

            {/* Recenter button — bottom right on map */}
            <button
                type="button"
                onClick={() => setRecenterTrigger((n) => n + 1)}
                className="absolute bottom-4 right-3 z-10 flex size-10 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm transition duration-100 hover:bg-white active:scale-95"
                aria-label="Recentrer sur ma position"
            >
                <MarkerPin01 className="size-5 text-[var(--ts-ochre)]" aria-hidden="true" />
            </button>

            {/* Two-Step logo — top left on map, offset past side panel */}
            <div className="pointer-events-none absolute left-14 top-2.5 z-10">
                <img src="/logo-horizontal.png" alt="Two-Step" className="h-7 opacity-70 drop-shadow-sm" />
            </div>

            <SidePanel merchants={merchants} isLoading={isLoading} />
        </div>
    );
}

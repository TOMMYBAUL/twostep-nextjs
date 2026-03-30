"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MarkerPin01, SearchMd, XClose, ChevronRight, Tag01, Clock, FilterLines, SearchLg, NavigationPointer01 } from "@untitledui/icons";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("../components/map-view").then(m => m.MapView), { ssr: false });
import { useGeolocation } from "../hooks/use-geolocation";
import { useAutocomplete } from "../hooks/use-search";
import { useFollows, useToggleFollow } from "../hooks/use-follows";
import { cx } from "@/utils/cx";
import { generateSlug } from "@/lib/slug";

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
    return Math.max(1, Math.round((km * 1.6) / 0.08));
}

export default function ExplorePage() {
    const router = useRouter();
    const { position, refresh: refreshGeo } = useGeolocation();
    const [category, setCategory] = useState<string | null>(null);
    const [sizeFilterExplore, setSizeFilterExplore] = useState<string | null>(null);
    const [shoeSizeFilterExplore, setShoeSizeFilterExplore] = useState<number | null>(null);
    const { data: availableSizes } = useQuery<{ clothing: string[]; shoe: number[] }>({
        queryKey: ["available-sizes"],
        queryFn: async () => {
            const res = await fetch("/api/products/available-sizes");
            if (!res.ok) return { clothing: [], shoe: [] };
            return res.json();
        },
        staleTime: 5 * 60_000,
    });
    const [recenterTrigger, setRecenterTrigger] = useState(0);
    const [is3D, setIs3D] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const [selectedMerchant, setSelectedMerchant] = useState<NearbyMerchant | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [viewMode, setViewMode] = useState<"carte" | "liste">("carte");
    const [radius, setRadius] = useState(5);
    const [radiusOpen, setRadiusOpen] = useState(false);

    const { data: suggestions } = useAutocomplete(searchFocused ? searchQuery : "");

    const handleSearch = (q: string) => {
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    };

    const activeSizeExplore = sizeFilterExplore ?? (shoeSizeFilterExplore ? String(shoeSizeFilterExplore) : null);

    const { data, isLoading } = useQuery<NearbyMerchant[]>({
        queryKey: ["merchants-nearby", position?.lat, position?.lng, category, radius, activeSizeExplore],
        queryFn: async () => {
            const params = new URLSearchParams({
                lat: position!.lat.toString(),
                lng: position!.lng.toString(),
                radius: radius.toString(),
            });
            if (category) params.set("category", category);
            if (activeSizeExplore) params.set("size", activeSizeExplore);
            const res = await fetch(`/api/nearby?${params}`);
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            return json.merchants;
        },
        enabled: !!position,
    });

    const merchants = data ?? [];

    useEffect(() => {
        const handler = () => { setSelectedMerchant(null); setFilterOpen(false); setRadiusOpen(false); };
        const map = document.querySelector("[class*='mapboxgl-canvas']");
        map?.addEventListener("click", handler);
        return () => map?.removeEventListener("click", handler);
    }, []);

    return (
        <div className="fixed inset-0">
            {/* Map — always mounted, hidden in liste mode */}
            <div className={cx("absolute inset-0", viewMode === "liste" && "invisible")}>
                <MapView
                    merchants={merchants}
                    userPosition={position}
                    className="h-full w-full"
                    recenterTrigger={recenterTrigger}
                    is3D={is3D}
                    selectedMerchantId={selectedMerchant?.merchant_id ?? null}
                    onMerchantSelect={(m) => setSelectedMerchant(m as NearbyMerchant)}
                />
            </div>

            {/* Liste view — dark fullscreen */}
            {viewMode === "liste" && (
                <div
                    className="absolute inset-0 z-20 overflow-y-auto bg-[#FFFFFF]"
                    style={{ paddingTop: "calc(env(safe-area-inset-top) + 140px)" }}
                >
                    <div className="px-4 pb-24">
                        <p role="status" aria-live="polite" aria-atomic="true" className="mb-3 text-sm font-bold text-[#1A1F36]">
                            {isLoading
                                ? "Recherche..."
                                : `${merchants.length} boutique${merchants.length !== 1 ? "s" : ""} à proximité`}
                        </p>

                        {isLoading ? (
                            <div className="flex flex-col gap-2">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-[#E2E5F0]" />
                                ))}
                            </div>
                        ) : merchants.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-20 text-center">
                                <SearchLg className="size-7 text-[#1A1F36]/15" />
                                <p className="text-sm font-medium text-[#1A1F36]/40">Aucune boutique trouvée</p>
                                <p className="text-[11px] text-[#1A1F36]/30">Essaie d'élargir ta zone ou de changer de catégorie</p>
                            </div>
                        ) : (
                            <ul role="list" className="flex flex-col gap-2">
                                {merchants.map((m) => (
                                    <li key={m.merchant_id}>
                                        <MerchantListCard merchant={m} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* ── Floating top bar (TGTG layout) ── */}
            <div
                className="absolute left-0 right-0 top-0 z-30 px-4"
                style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
            >
                {/* Search row: input + location + filter */}
                <div className="flex gap-2">
                    <div className={cx(
                        "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-white px-4 py-3 shadow-md transition-all duration-200",
                        searchFocused && "shadow-lg ring-2 ring-[#4268FF]/20",
                    )}>
                        <SearchMd className="size-[18px] shrink-0 text-gray-400" aria-hidden="true" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(searchQuery); }}
                            placeholder="Rechercher"
                            className="min-w-0 flex-1 bg-transparent text-sm text-[#1A1F36] outline-none placeholder:text-gray-400"
                        />
                        {searchQuery && (
                            <button type="button" onClick={() => setSearchQuery("")} className="text-gray-400 hover:text-gray-600">
                                <XClose className="size-4" />
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => { setRadiusOpen((v) => !v); setFilterOpen(false); }}
                        className={cx(
                            "flex shrink-0 items-center gap-1 rounded-xl px-3 shadow-md transition duration-150 active:scale-95",
                            radiusOpen ? "bg-[#4268FF] text-white" : "bg-white text-[#1A1F36]",
                        )}
                        aria-label="Rayon de recherche"
                    >
                        <MarkerPin01 className="size-4" aria-hidden="true" />
                        <span className="text-xs font-semibold">{radius} km</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => { setFilterOpen((v) => !v); setRadiusOpen(false); }}
                        className={cx(
                            "flex size-12 shrink-0 items-center justify-center rounded-xl shadow-md transition duration-150 active:scale-95",
                            category ? "bg-[#4268FF] text-white" : "bg-white text-[#1A1F36]",
                        )}
                        aria-label="Filtres"
                    >
                        <FilterLines className="size-5" aria-hidden="true" />
                    </button>
                </div>

                {/* Liste / Carte toggle */}
                <div className="mt-3 flex justify-center">
                    <div className="flex rounded-full bg-white p-1 shadow-md">
                        <button
                            type="button"
                            onClick={() => { setViewMode("liste"); setSelectedMerchant(null); }}
                            className={cx(
                                "rounded-full px-6 py-2 text-sm font-semibold transition duration-150",
                                viewMode === "liste" ? "bg-[#4268FF] text-white" : "text-[#1A1F36]",
                            )}
                        >
                            Liste
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("carte")}
                            className={cx(
                                "rounded-full px-6 py-2 text-sm font-semibold transition duration-150",
                                viewMode === "carte" ? "bg-[#4268FF] text-white" : "text-[#1A1F36]",
                            )}
                        >
                            Carte
                        </button>
                    </div>
                </div>

                {/* Search suggestions */}
                {searchFocused && suggestions && suggestions.length > 0 && (
                    <div role="listbox" aria-label="Suggestions" className="mt-2 overflow-hidden rounded-2xl bg-white shadow-xl">
                        {suggestions.map((s, i) => (
                            <button
                                key={`${s.suggestion_type}-${s.suggestion}-${i}`}
                                type="button"
                                role="option"
                                aria-selected={false}
                                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-[#1A1F36] transition duration-100 hover:bg-gray-50"
                                onMouseDown={(e) => { e.preventDefault(); handleSearch(s.suggestion); }}
                            >
                                <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                    {s.suggestion_type === "product" ? "Produit" : s.suggestion_type === "brand" ? "Marque" : "Catégorie"}
                                </span>
                                {s.suggestion}
                            </button>
                        ))}
                    </div>
                )}

                {/* Radius selector dropdown */}
                {radiusOpen && (
                    <div className="mt-2 overflow-hidden rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5">
                        <p className="text-xs font-semibold text-[#1A1F36]">Rayon de recherche</p>
                        <div className="mt-3 flex items-center gap-3">
                            <input
                                type="range"
                                min={1}
                                max={10}
                                step={1}
                                value={radius}
                                onChange={(e) => setRadius(Number(e.target.value))}
                                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#4268FF] [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#4268FF] [&::-webkit-slider-thumb]:shadow-md"
                            />
                            <span className="w-12 shrink-0 text-right text-sm font-bold text-[#4268FF]">{radius} km</span>
                        </div>
                        <div className="mt-1.5 flex justify-between text-[10px] text-gray-400">
                            <span>1 km</span>
                            <span>5 km</span>
                            <span>10 km</span>
                        </div>
                    </div>
                )}

                {/* Category + size filter dropdown */}
                {filterOpen && (
                    <div className="ml-auto mt-2 max-h-[60vh] w-64 overflow-y-auto overscroll-contain rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-black/5">
                        {/* Categories */}
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.label}
                                type="button"
                                onClick={() => { setCategory(cat.value); setSelectedMerchant(null); setFilterOpen(false); }}
                                className={cx(
                                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition duration-100",
                                    category === cat.value
                                        ? "bg-[#4268FF]/10 font-semibold text-[#4268FF]"
                                        : "text-[#1A1F36] hover:bg-gray-50",
                                )}
                            >
                                {cat.emoji && <span>{cat.emoji}</span>}
                                <span className="font-medium">{cat.label}</span>
                            </button>
                        ))}

                        {/* Separator */}
                        <div className="mx-2 my-1.5 border-t border-gray-100" />

                        {/* Taille vêtements */}
                        {(availableSizes?.clothing?.length ?? 0) > 0 && (
                            <>
                                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Taille</p>
                                <div className="flex flex-wrap gap-1 px-2 pb-2">
                                    {availableSizes!.clothing.map((s) => (
                                        <button key={s} type="button" onClick={() => setSizeFilterExplore(sizeFilterExplore === s ? null : s)}
                                            className={cx("rounded-md px-2 py-1 text-[11px] font-medium transition", sizeFilterExplore === s ? "bg-[#4268FF] text-white" : "bg-gray-100 text-gray-600")}
                                        >{s}</button>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Pointure */}
                        {(availableSizes?.shoe?.length ?? 0) > 0 && (
                            <>
                                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pointure</p>
                                <div className="flex flex-wrap gap-1 px-2 pb-2">
                                    {availableSizes!.shoe.map((s) => (
                                        <button key={s} type="button" onClick={() => setShoeSizeFilterExplore(shoeSizeFilterExplore === s ? null : s)}
                                            className={cx("rounded-md px-2 py-1 text-[11px] font-medium transition", shoeSizeFilterExplore === s ? "bg-[#4268FF] text-white" : "bg-gray-100 text-gray-600")}
                                        >{s}</button>
                                    ))}
                                </div>
                            </>
                        )}

                        {(availableSizes?.clothing?.length ?? 0) === 0 && (availableSizes?.shoe?.length ?? 0) === 0 && (
                            <p className="px-3 py-2 text-[11px] text-gray-400">Aucune taille renseignée pour le moment.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Map controls — carte mode only */}
            {viewMode === "carte" && (
                <div className="absolute right-3 z-10 flex flex-col gap-2" style={{ bottom: "calc(env(safe-area-inset-bottom) + 62px)" }}>
                    <button
                        type="button"
                        onClick={() => setIs3D((v) => !v)}
                        className={cx(
                            "flex size-11 items-center justify-center rounded-xl shadow-md transition duration-150 active:scale-95",
                            is3D ? "bg-[#4268FF] text-white" : "bg-white text-[#1A1F36]",
                        )}
                        aria-label={is3D ? "Vue 2D" : "Vue 3D"}
                    >
                        <span className="text-xs font-bold">3D</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { refreshGeo(); setRecenterTrigger((n) => n + 1); }}
                        className="flex size-11 items-center justify-center rounded-xl bg-white shadow-md transition duration-150 active:scale-95"
                        aria-label="Recentrer"
                    >
                        <NavigationPointer01 className="size-5 text-[#4268FF]" aria-hidden="true" />
                    </button>
                </div>
            )}

            {/* Mini-fiche — carte mode, when a pin is tapped */}
            {viewMode === "carte" && selectedMerchant && (
                <div className="absolute left-4 right-4 z-30 mx-auto max-w-md animate-in slide-in-from-bottom-4 fade-in duration-200" style={{ bottom: "calc(env(safe-area-inset-bottom) + 62px)" }}>
                    <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
                        <div className="flex items-center gap-3 p-4">
                            <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
                                {selectedMerchant.merchant_photo || selectedMerchant.merchant_logo ? (
                                    <Image src={selectedMerchant.merchant_logo || selectedMerchant.merchant_photo || ""} alt="" fill className="object-cover" />
                                ) : (
                                    <span className="text-lg font-bold text-[#4268FF]">
                                        {selectedMerchant.merchant_name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                                    </span>
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <h3 className="truncate text-sm font-bold text-[#1A1F36]">{selectedMerchant.merchant_name}</h3>
                                <p className="mt-0.5 truncate text-xs text-gray-500">{selectedMerchant.merchant_address}</p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                    <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--ts-sage)]">
                                        <Clock className="size-3" aria-hidden="true" />
                                        {walkingMinutes(selectedMerchant.distance_km)} min à pied
                                    </span>
                                    <span className="text-[11px] text-gray-300">·</span>
                                    <span className="text-[11px] font-medium text-gray-500">
                                        {selectedMerchant.product_count} produit{selectedMerchant.product_count > 1 ? "s" : ""} en stock
                                    </span>
                                    {selectedMerchant.promo_count > 0 && (
                                        <>
                                            <span className="text-[11px] text-gray-300">·</span>
                                            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-[var(--ts-red)]">
                                                <Tag01 className="size-2.5" aria-hidden="true" />
                                                {selectedMerchant.promo_count} promo{selectedMerchant.promo_count > 1 ? "s" : ""}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <Link
                                href={`/shop/${generateSlug(selectedMerchant.merchant_name, selectedMerchant.merchant_id)}`}
                                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#4268FF] text-white shadow-sm transition duration-150 active:scale-95"
                            >
                                <ChevronRight className="size-5" />
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── Merchant card for Liste view ── */
function MerchantListCard({ merchant }: { merchant: NearbyMerchant }) {
    const minutes = walkingMinutes(merchant.distance_km);
    const logo = merchant.merchant_logo || merchant.merchant_photo;
    const { data: follows } = useFollows();
    const { follow, unfollow } = useToggleFollow();
    const isFollowing = follows?.some((f: any) => f.merchant_id === merchant.merchant_id) ?? false;

    return (
        <div className="flex items-center gap-3 rounded-2xl bg-[#E2E5F0] p-3">
            <Link
                href={`/shop/${generateSlug(merchant.merchant_name, merchant.merchant_id)}`}
                className="flex flex-1 items-center gap-3 min-w-0 transition duration-150 active:opacity-80"
            >
                <div className="relative flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFFFFF]">
                    {logo ? (
                        <Image src={logo} alt="" fill className="object-cover" />
                    ) : (
                        <span className="text-lg font-bold text-[#4268FF]">
                            {merchant.merchant_name.charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#1A1F36]">{merchant.merchant_name}</p>
                    <p className="mt-0.5 truncate text-xs text-[#1A1F36]/50">{merchant.merchant_address}</p>
                    <div className="mt-1 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[11px] text-[#1A1F36]/50">
                            <Clock className="size-3 shrink-0" aria-hidden="true" />
                            {minutes} min
                        </span>
                        <span className="text-[#1A1F36]/20">·</span>
                        <span className="text-[11px] font-medium text-[var(--ts-sage)]">
                            {merchant.product_count} produit{merchant.product_count > 1 ? "s" : ""}
                        </span>
                        {merchant.promo_count > 0 && (
                            <span className="flex items-center gap-0.5 rounded-full bg-[var(--ts-red)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ts-red)]">
                                <Tag01 className="size-2.5" aria-hidden="true" />
                                {merchant.promo_count} promo{merchant.promo_count > 1 ? "s" : ""}
                            </span>
                        )}
                    </div>
                </div>
            </Link>

            <button
                type="button"
                onClick={() => isFollowing ? unfollow.mutate(merchant.merchant_id) : follow.mutate(merchant.merchant_id)}
                className={cx(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition duration-150 active:scale-[0.97]",
                    merchant.promo_count > 0 && "self-start mt-1",
                    isFollowing
                        ? "border border-[#1A1F36]/15 text-[#1A1F36]/50"
                        : "bg-[#4268FF] text-white",
                )}
            >
                {isFollowing ? "Abonné ✓" : "S'abonner"}
            </button>
        </div>
    );
}

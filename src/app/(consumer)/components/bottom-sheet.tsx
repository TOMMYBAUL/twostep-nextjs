"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Drawer } from "vaul";
import { MarkerPin01, Tag01, ChevronRight, SearchLg, Clock } from "@untitledui/icons";
import { generateSlug } from "@/lib/slug";

interface Merchant {
    merchant_id: string;
    merchant_name: string;
    merchant_description?: string | null;
    merchant_photo?: string | null;
    merchant_logo?: string | null;
    merchant_address: string;
    merchant_city?: string;
    distance_km: number;
    product_count: number;
    promo_count: number;
}

interface BottomSheetProps {
    merchants: Merchant[];
    isLoading: boolean;
    distLabel?: string;
}

const SNAP_POINTS = ["148px", "50%", 1] as const;
const MIN_SNAP = SNAP_POINTS[0];

function walkingMinutes(km: number): number {
    return Math.max(1, Math.round((km * 1.6) / 0.08)); // vol d'oiseau × 1.6 (centre-ville dense, ponts, rues sinueuses), ~5km/h
}

export function BottomSheet({ merchants, isLoading, distLabel }: BottomSheetProps) {
    const [snap, setSnap] = useState<string | number | null>(MIN_SNAP);

    const handleSnapChange = useCallback((point: string | number | null) => {
        setSnap(point ?? MIN_SNAP);
    }, []);

    return (
        <Drawer.Root
            open
            modal={false}
            snapPoints={[...SNAP_POINTS]}
            activeSnapPoint={snap}
            setActiveSnapPoint={handleSnapChange}
            dismissible={false}
            fadeFromIndex={0}
        >
            <Drawer.Portal>
                <Drawer.Content
                    className="fixed bottom-0 left-0 right-0 z-40 flex max-h-[92dvh] flex-col rounded-t-3xl bg-white outline-none"
                    aria-describedby={undefined}
                >
                    <Drawer.Title className="sr-only">Boutiques près de chez toi</Drawer.Title>

                    {/* Drag handle */}
                    <div
                        className="flex shrink-0 cursor-grab touch-none items-center justify-center pb-2 pt-3 active:cursor-grabbing"
                        onDoubleClick={() => setSnap(snap === MIN_SNAP ? "50%" : MIN_SNAP)}
                    >
                        <div className="h-1 w-10 rounded-full bg-[#1A1F36]/20" />
                    </div>

                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between px-5 pb-3">
                        <div>
                            <h2 className="text-sm font-bold text-[#1A1F36]">
                                {isLoading
                                    ? "Recherche..."
                                    : `${merchants.length} boutique${merchants.length !== 1 ? "s" : ""}`}
                            </h2>
                            {!isLoading && merchants.length > 0 && distLabel && (
                                <p className="text-[11px] text-[#1A1F36]/50">
                                    dans un rayon de {distLabel}
                                </p>
                            )}
                        </div>
                        {snap === MIN_SNAP && merchants.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setSnap("50%")}
                                className="text-xs font-semibold text-[#4268FF]"
                            >
                                Voir tout
                            </button>
                        )}
                    </div>

                    {/* Merchant list */}
                    <div className="flex-1 overflow-y-auto px-4 pb-24">
                        {isLoading ? (
                            <div className="flex flex-col gap-2">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-[#F8F9FC]" />
                                ))}
                            </div>
                        ) : merchants.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-8 text-center">
                                <SearchLg className="size-7 text-[#1A1F36]/15" />
                                <p className="text-sm font-medium text-[#1A1F36]/40">Aucune boutique trouvée</p>
                                <p className="text-[11px] text-[#1A1F36]/30">Essaie d'élargir ta zone ou de changer de catégorie</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {merchants.map((m) => (
                                    <MerchantCard key={m.merchant_id} merchant={m} />
                                ))}
                            </div>
                        )}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}

function MerchantCard({ merchant }: { merchant: Merchant }) {
    const minutes = walkingMinutes(merchant.distance_km);
    const logo = merchant.merchant_logo || merchant.merchant_photo;

    return (
        <Link
            href={`/shop/${generateSlug(merchant.merchant_name, merchant.merchant_id)}`}
            className="flex items-center gap-3 rounded-2xl bg-[#F8F9FC] p-3 transition duration-150 active:bg-[#F8F9FC]/80"
        >
            {/* Avatar */}
            <div className="flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
                {logo ? (
                    <img src={logo} alt="" className="h-full w-full object-cover" />
                ) : (
                    <span className="text-lg font-bold text-[#4268FF]">
                        {merchant.merchant_name.charAt(0).toUpperCase()}
                    </span>
                )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[#1A1F36]">{merchant.merchant_name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#1A1F36]/50">
                    <Clock className="size-3 shrink-0" aria-hidden="true" />
                    {minutes} min à pied
                    <span className="text-[#1A1F36]/30">·</span>
                    <MarkerPin01 className="size-3 shrink-0" aria-hidden="true" />
                    {merchant.distance_km < 1 ? `${Math.round(merchant.distance_km * 1000)}m` : `${merchant.distance_km.toFixed(1)}km`}
                </p>
                <div className="mt-1 flex items-center gap-2">
                    <span className="text-[11px] font-medium text-[var(--ts-sage)]">
                        {merchant.product_count} produit{merchant.product_count > 1 ? "s" : ""} en stock
                    </span>
                    {merchant.promo_count > 0 && (
                        <span className="flex items-center gap-0.5 rounded-full bg-[var(--ts-red)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ts-red)]">
                            <Tag01 className="size-2.5" aria-hidden="true" />
                            {merchant.promo_count} promo{merchant.promo_count > 1 ? "s" : ""}
                        </span>
                    )}
                </div>
            </div>

            <ChevronRight className="size-4 shrink-0 text-[#1A1F36]/15" />
        </Link>
    );
}

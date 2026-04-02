"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Building07 } from "@untitledui/icons";
import { getOpenStatus } from "../../lib/opening-hours";
import { generateSlug } from "@/lib/slug";
import { cx } from "@/utils/cx";

interface ShopStatusBlockProps {
    merchantId: string;
    name: string;
    address: string;
    city: string;
    photoUrl: string | null;
    phone: string | null;
    openingHours: Record<string, { open: string; close: string }> | null;
    distanceKm: number | null;
}

export function ShopStatusBlock({
    merchantId, name, address, city, photoUrl, openingHours, distanceKm,
}: ShopStatusBlockProps) {
    const shopSlug = generateSlug(name, merchantId);
    const status = getOpenStatus(openingHours);

    const formattedDistance = distanceKm != null
        ? distanceKm < 1
            ? `${Math.round(distanceKm * 1000)}m`
            : `${distanceKm.toFixed(1)}km`
        : null;

    return (
        <Link
            href={`/shop/${shopSlug}`}
            className="flex items-center gap-3 border-b border-secondary py-3.5 transition duration-100 active:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded-lg"
        >
            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-secondary">
                {photoUrl ? (
                    <Image src={photoUrl} alt={name} width={36} height={36} className="h-full w-full object-cover" />
                ) : (
                    <Building07 className="size-4 text-brand-secondary" aria-hidden="true" />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-primary">{name}</span>
                    {status && (
                        <span
                            className={cx(
                                "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold",
                                status.isOpen
                                    ? "bg-success-secondary text-success-primary"
                                    : "bg-error-secondary text-error-primary",
                            )}
                        >
                            <span
                                className={cx(
                                    "size-[5px] rounded-full",
                                    status.isOpen ? "bg-success-primary" : "bg-error-primary",
                                )}
                            />
                            {status.isOpen ? "Ouvert" : "Fermé"}
                        </span>
                    )}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-tertiary">
                    <span className="truncate">{address}, {city}</span>
                    {formattedDistance && (
                        <>
                            <span>·</span>
                            <span className="shrink-0">{formattedDistance}</span>
                        </>
                    )}
                    {status && !status.isOpen && status.label.includes("Ouvre") && (
                        <>
                            <span>·</span>
                            <span className="shrink-0 text-warning-primary">
                                {status.label.split("· ")[1]}
                            </span>
                        </>
                    )}
                </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
        </Link>
    );
}

"use client";

import { usePathname } from "next/navigation";
import { useMerchant } from "@/hooks/use-merchant";

const breadcrumbLabels: Record<string, string> = {
    "/dashboard": "Accueil",
    "/dashboard/products": "Produits",
    "/dashboard/promotions": "Promotions",
    "/dashboard/store": "Ma boutique",
    "/dashboard/invoices": "Factures",
    "/dashboard/settings": "Réglages",
    "/dashboard/achievements": "Trophées",
    "/dashboard/stock": "Stock",
    "/dashboard/tips-history": "Historique tips",
};

export function TopHeaderBar() {
    const pathname = usePathname();
    const { merchant } = useMerchant();

    const pageLabel = Object.entries(breadcrumbLabels)
        .filter(([path]) => pathname.startsWith(path))
        .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? "Dashboard";

    const initials = merchant?.name
        ? merchant.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
        : "TS";

    return (
        <div className="hidden lg:flex h-[52px] items-center border-b border-[#F0EBE3] bg-white px-5 gap-3">
            {/* Logo */}
            <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-[#2C1A0E] text-[12px] font-bold text-white">T</div>
                <span className="text-sm font-bold text-[#2C1A0E]">Two-Step</span>
            </div>

            <div className="flex-1" />

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-[#8B7355]">Dashboard</span>
                <span className="text-[#8B7355]">›</span>
                <span className="font-semibold text-[#2C1A0E]">{pageLabel}</span>
            </div>

            <div className="flex-1" />

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button className="flex size-8 items-center justify-center rounded-full bg-[#F5F1EB] transition hover:bg-[#ebe7d0]">
                    <svg className="size-4 text-[#8B7355]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                </button>
                <div className="flex size-8 items-center justify-center rounded-full bg-[#D4A574] text-[11px] font-bold text-white">
                    {initials}
                </div>
            </div>
        </div>
    );
}

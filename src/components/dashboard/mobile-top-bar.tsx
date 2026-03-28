"use client";

import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
    "/dashboard": "Accueil",
    "/dashboard/products": "Produits",
    "/dashboard/promotions": "Promotions",
    "/dashboard/store": "Ma boutique",
    "/dashboard/settings": "Réglages",
    "/dashboard/achievements": "Trophées",
    "/dashboard/stock": "Stock",
    "/dashboard/tips-history": "Historique tips",
};

export function MobileTopBar() {
    const pathname = usePathname();

    const title = Object.entries(pageTitles)
        .filter(([path]) => pathname.startsWith(path))
        .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? "Dashboard";

    return (
        <div className="safe-top bg-[#2C1A0E] md:hidden">
            <div className="flex h-12 items-center justify-center gap-2 px-4">
                <img src="/logo-icon.webp" alt="Two-Step" className="size-7 rounded-lg" />
                <span className="text-[15px] font-semibold text-white">{title}</span>
            </div>
        </div>
    );
}

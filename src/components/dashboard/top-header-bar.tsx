"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMerchant } from "@/hooks/use-merchant";
import { generateSlug } from "@/lib/slug";

const breadcrumbLabels: Record<string, string> = {
    "/dashboard": "Accueil",
    "/dashboard/products": "Produits",
    "/dashboard/promotions": "Promotions",
    "/dashboard/store": "Ma boutique",
    "/dashboard/settings": "Réglages",
    "/dashboard/achievements": "Trophées",
    "/dashboard/tips-history": "Historique tips",
};

export function TopHeaderBar() {
    const pathname = usePathname();
    const { merchant } = useMerchant();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const pageLabel = Object.entries(breadcrumbLabels)
        .filter(([path]) => pathname.startsWith(path))
        .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? "Dashboard";

    const initials = merchant?.name
        ? merchant.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
        : "TS";

    const shopSlug = merchant
        ? (merchant.slug ?? generateSlug(merchant.name, merchant.id))
        : null;

    // Close menu on click outside
    useEffect(() => {
        if (!menuOpen) return;
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [menuOpen]);

    return (
        <div className="hidden lg:flex h-[52px] items-center border-b border-[#F0EBE3] bg-white px-5 gap-3">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-[#8B7355]">Dashboard</span>
                <span className="text-[#8B7355]">›</span>
                <span className="font-semibold text-[#2C1A0E]">{pageLabel}</span>
            </div>

            <div className="flex-1" />

            {/* Actions */}
            <div className="flex items-center gap-2">
                {/* Notification bell */}
                <button className="flex size-8 items-center justify-center rounded-full bg-[#F5F1EB] transition hover:bg-[#ebe7d0]">
                    <svg className="size-4 text-[#8B7355]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                </button>

                {/* Avatar + dropdown menu */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="flex size-8 items-center justify-center rounded-full bg-[#D4A574] text-[11px] font-bold text-white transition hover:opacity-90"
                    >
                        {initials}
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-10 z-50 w-52 rounded-xl bg-white py-2 shadow-lg border border-[#F0EBE3]">
                            {/* Merchant name header */}
                            {merchant && (
                                <div className="px-4 py-2 border-b border-gray-100">
                                    <p className="text-xs font-semibold text-[#2C1A0E] truncate">{merchant.name}</p>
                                    <p className="text-[10px] text-[#8B7355] truncate">{merchant.address}</p>
                                </div>
                            )}

                            <Link
                                href="/dashboard/store"
                                onClick={() => setMenuOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-[#2C1A0E] no-underline transition hover:bg-gray-50"
                            >
                                <svg className="size-4 text-[#8B7355]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                                Mon profil
                            </Link>

                            {shopSlug && (
                                <a
                                    href={`/shop/${shopSlug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setMenuOpen(false)}
                                    className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-[#2C1A0E] no-underline transition hover:bg-gray-50"
                                >
                                    <svg className="size-4 text-[#8B7355]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                    Voir ma boutique
                                </a>
                            )}

                            <a
                                href="mailto:support@twostep.fr"
                                onClick={() => setMenuOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-[#2C1A0E] no-underline transition hover:bg-gray-50"
                            >
                                <svg className="size-4 text-[#8B7355]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                Support
                            </a>

                            <Link
                                href="/mentions-legales"
                                onClick={() => setMenuOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-[#2C1A0E] no-underline transition hover:bg-gray-50"
                            >
                                <svg className="size-4 text-[#8B7355]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                                    <path d="M14 2v6h6" />
                                </svg>
                                Mentions légales
                            </Link>

                            <div className="my-1 border-t border-gray-100" />

                            <button
                                onClick={() => { setMenuOpen(false); window.location.href = "/auth/logout"; }}
                                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs text-[#c4553a] transition hover:bg-red-50"
                            >
                                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                Déconnexion
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

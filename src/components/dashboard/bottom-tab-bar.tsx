"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BottomSheetMore } from "./bottom-sheet-more";

const tabs = [
    {
        href: "/dashboard",
        label: "Accueil",
        exact: true,
        icon: (
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
        ),
    },
    {
        href: "/dashboard/products",
        label: "Produits",
        icon: (
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.5 7.28L12 2 3.5 7.28M20.5 7.28V16.72L12 22M20.5 7.28L12 12.56M3.5 7.28V16.72L12 22M3.5 7.28L12 12.56M12 22V12.56" />
            </svg>
        ),
    },
    {
        href: "/dashboard/promotions",
        label: "Promos",
        icon: (
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 7.5L12 2l10 5.5M2 7.5v4l10 5.5M2 7.5l10 5.5m10-5.5v4l-10 5.5m0 0v-4m0-7L4 9" />
            </svg>
        ),
    },
    {
        href: "/dashboard/store",
        label: "Boutique",
        icon: (
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V7l8-4v18M13 7h6v14M9 9h.01M9 13h.01M9 17h.01M17 11h.01M17 15h.01" />
            </svg>
        ),
    },
];

function TabItem({ href, label, icon, isActive }: { href: string; label: string; icon: React.ReactNode; isActive: boolean }) {
    return (
        <Link
            href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 no-underline transition-colors ${
                isActive ? "text-[#D4A574]" : "text-[#8B7355]"
            }`}
        >
            {icon}
            <span className={`text-[10px] ${isActive ? "font-semibold" : ""}`}>{label}</span>
        </Link>
    );
}

export function BottomTabBar() {
    const pathname = usePathname();
    const [moreOpen, setMoreOpen] = useState(false);

    const isMoreActive = pathname.startsWith("/dashboard/invoices") || pathname.startsWith("/dashboard/settings");

    return (
        <>
            <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center border-t border-[#F0EBE3] bg-white safe-bottom md:hidden">
                {tabs.map((tab) => {
                    const isActive = "exact" in tab && tab.exact
                        ? pathname === tab.href
                        : pathname.startsWith(tab.href);
                    return (
                        <TabItem
                            key={tab.href}
                            href={tab.href}
                            label={tab.label}
                            icon={tab.icon}
                            isActive={isActive}
                        />
                    );
                })}
                <button
                    onClick={() => setMoreOpen(true)}
                    className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors ${
                        isMoreActive ? "text-[#D4A574]" : "text-[#8B7355]"
                    }`}
                >
                    <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="19" cy="12" r="2" />
                    </svg>
                    <span className={`text-[10px] ${isMoreActive ? "font-semibold" : ""}`}>Plus</span>
                </button>
            </nav>

            <BottomSheetMore open={moreOpen} onOpenChange={setMoreOpen} />
        </>
    );
}

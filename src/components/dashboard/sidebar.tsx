"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/utils/cx";

const navItems = [
    {
        href: "/dashboard",
        label: "Accueil",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
        ),
        exact: true,
    },
    {
        href: "/dashboard/products",
        label: "Produits",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.5 7.28L12 2 3.5 7.28M20.5 7.28V16.72L12 22M20.5 7.28L12 12.56M3.5 7.28V16.72L12 22M3.5 7.28L12 12.56M12 22V12.56" />
            </svg>
        ),
    },
    {
        href: "/dashboard/stock",
        label: "Stock",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
        ),
    },
    {
        href: "/dashboard/promotions",
        label: "Promotions",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 7.5L12 2l10 5.5M2 7.5v4l10 5.5M2 7.5l10 5.5m10-5.5v4l-10 5.5m0 0v-4m0-7L4 9" />
            </svg>
        ),
    },
    {
        href: "/dashboard/store",
        label: "Ma boutique",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V7l8-4v18M13 7h6v14M9 9h.01M9 13h.01M9 17h.01M17 11h.01M17 15h.01" />
            </svg>
        ),
    },
];

const settingsItem = {
    href: "/dashboard/settings",
    label: "Réglages",
    icon: (
        <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
    ),
};

function NavItem({ href, label, icon, isActive }: { href: string; label: string; icon: React.ReactNode; isActive: boolean }) {
    return (
        <Link
            href={href}
            className={cx(
                "nav-item relative flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 whitespace-nowrap transition-colors",
                isActive
                    ? "nav-item-active bg-white/20 text-white"
                    : "text-white/60 hover:bg-white/10",
            )}
        >
            {icon}
            <span className={cx("nav-label text-[13px]", isActive && "font-semibold")}>{label}</span>
            <span className="nav-tooltip absolute left-[60px] top-1/2 -translate-y-1/2 rounded-md bg-gray-900 px-2.5 py-1 text-[11px] text-white whitespace-nowrap z-10">
                {label}
            </span>
        </Link>
    );
}

export function DashboardSidebar() {
    const pathname = usePathname();

    return (
        <aside className="sidebar-ts hidden md:flex h-screen flex-col shrink-0">
            {/* Logo */}
            <div className="flex h-[60px] items-center gap-2.5 px-4">
                <img src="/logo-icon.webp" alt="Two-Step" className="size-9 shrink-0 rounded-[10px]" />
                <span className="logo-text font-display text-[15px] font-bold text-white whitespace-nowrap">
                    Two-Step
                </span>
            </div>

            {/* Main nav */}
            <nav className="flex flex-1 flex-col gap-0.5 px-1.5 pt-2">
                {navItems.map((item) => (
                    <NavItem
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        isActive={"exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href)}
                    />
                ))}
            </nav>

            {/* Settings (bottom) */}
            <div className="px-1.5 pb-4">
                <NavItem
                    {...settingsItem}
                    isActive={pathname.startsWith(settingsItem.href)}
                />
            </div>
        </aside>
    );
}

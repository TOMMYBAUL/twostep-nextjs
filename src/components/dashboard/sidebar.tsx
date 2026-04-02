"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
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
        href: "/dashboard/google",
        label: "Google",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
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
        href: "/dashboard/achievements",
        label: "Trophées",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6m12 5h1.5a2.5 2.5 0 0 0 0-5H18M6 4h12v5a6 6 0 0 1-12 0V4zM9 20h6M12 15v5" />
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

const exploreItem = {
    href: "/discover",
    label: "Explorer les boutiques",
    icon: (
        <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
        </svg>
    ),
};

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
                "nav-item relative flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 min-h-[44px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                isActive
                    ? "nav-item-active bg-white/20 text-white"
                    : "text-white/60 hover:bg-white/10",
            )}
        >
            <span aria-hidden="true">{icon}</span>
            <span className={cx("nav-label text-[13px]", isActive && "font-semibold")}>{label}</span>
            <span className="nav-tooltip absolute left-[60px] top-1/2 -translate-y-1/2 rounded-md bg-primary-solid px-2.5 py-1 text-[11px] text-white whitespace-nowrap z-10">
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
                <Image src="/logo-icon.webp" alt="Two-Step" width={36} height={36} className="shrink-0 rounded-[10px]" />
                <span className="logo-text font-display text-[15px] font-bold uppercase text-white whitespace-nowrap">
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

            {/* Bottom links */}
            <div className="space-y-0.5 px-1.5 pb-4">
                <NavItem
                    {...exploreItem}
                    isActive={false}
                />
                <NavItem
                    {...settingsItem}
                    isActive={pathname.startsWith(settingsItem.href)}
                />
            </div>
        </aside>
    );
}

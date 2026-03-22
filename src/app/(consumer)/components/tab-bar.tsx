"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { MarkerPin01, SearchMd, Heart, User01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const tabs = [
    { href: "/explore", label: "Explorer", icon: MarkerPin01 },
    { href: "/search", label: "Rechercher", icon: SearchMd },
    { href: "/favorites", label: "Favoris", icon: Heart },
    { href: "/profile", label: "Profil", icon: User01 },
] as const;

export function TabBar() {
    const pathname = usePathname();

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 border-t border-secondary bg-primary"
            role="tablist"
            aria-label="Navigation principale"
        >
            <div className="mx-auto flex max-w-lg items-center justify-around">
                {tabs.map((tab) => {
                    const isActive = pathname.startsWith(tab.href);
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            role="tab"
                            aria-selected={isActive}
                            aria-label={tab.label}
                            className={cx(
                                "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition duration-100 ease-linear",
                                isActive
                                    ? "text-[var(--ts-ochre)]"
                                    : "text-tertiary hover:text-secondary",
                            )}
                        >
                            {isActive && (
                                <span className="absolute -top-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[var(--ts-ochre)] shadow-[0_0_8px_var(--ts-ochre)]" />
                            )}
                            <Icon className="size-5" aria-hidden="true" />
                            <span className="font-medium">{tab.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home02, MarkerPin01, Heart, User01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { cx } from "@/utils/cx";

const tabs = [
    { href: "/discover", label: "Accueil", icon: Home02 },
    { href: "/explore", label: "Carte", icon: MarkerPin01 },
    { href: "/favorites", label: "Favoris", icon: Heart },
    { href: "/profile", label: "Profil", icon: User01 },
] as const;

export function TabBar() {
    const pathname = usePathname();

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur-md"
            role="tablist"
            aria-label="Navigation principale"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <div className="mx-auto flex max-w-lg items-center justify-around">
                {tabs.map((tab) => {
                    const isActive =
                        tab.href === "/discover"
                            ? pathname === "/discover" || pathname === "/"
                            : pathname.startsWith(tab.href);
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            role="tab"
                            aria-selected={isActive}
                            aria-label={tab.label}
                            className={cx(
                                "relative flex flex-1 flex-col items-center gap-0.5 pb-1 pt-2 text-[10px] font-medium transition duration-150 ease-out",
                                isActive
                                    ? "text-[#4268FF]"
                                    : "text-gray-400 active:text-[#4268FF]",
                            )}
                        >
                            {isActive && (
                                <motion.span
                                    layoutId="tab-indicator"
                                    className="absolute -top-px left-1/2 h-[2.5px] w-6 -translate-x-1/2 rounded-full bg-[#4268FF]"
                                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                />
                            )}
                            <Icon
                                className="size-[22px]"
                                fill={isActive ? "currentColor" : "none"}
                                strokeWidth={isActive ? 1.5 : 2}
                                aria-hidden="true"
                            />
                            <span>{tab.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

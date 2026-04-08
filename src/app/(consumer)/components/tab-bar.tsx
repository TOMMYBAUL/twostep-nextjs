"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Home02, SearchMd, Tag01, User01 } from "@untitledui/icons";
import { motion, useReducedMotion } from "motion/react";
import { cx } from "@/utils/cx";

const tabs = [
    { href: "/explore", label: "Recherche", icon: SearchMd },
    { href: "/discover", label: "Explorer", icon: Home02 },
    { href: "/search?filter=promos", label: "Promos", icon: Tag01 },
    { href: "/profile", label: "Profil", icon: User01 },
] as const;

function TabBarInner() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const prefersReducedMotion = useReducedMotion();

    return (
        <nav
            className="ts-tab-bar fixed bottom-0 left-0 right-0 z-50 border-t border-secondary bg-white/95 backdrop-blur-md"
            aria-label="Navigation principale"
        >
            <div className="mx-auto flex max-w-lg items-center justify-around">
                {tabs.map((tab) => {
                    const isActive =
                        tab.href === "/explore"
                            ? pathname === "/explore" || pathname === "/"
                            : tab.href.startsWith("/search")
                                ? pathname === "/search" && searchParams.get("filter") === "promos"
                                : pathname.startsWith(tab.href);
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            aria-current={isActive ? "page" : undefined}
                            aria-label={tab.label}
                            className={cx(
                                "relative flex min-h-[48px] flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium transition duration-150 ease-out focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                                isActive
                                    ? "text-brand-secondary"
                                    : "text-tertiary active:text-brand-secondary",
                            )}
                        >
                            {isActive && (
                                <motion.span
                                    layoutId="tab-indicator"
                                    className="absolute -top-px left-1/2 h-[2.5px] w-6 -translate-x-1/2 rounded-full bg-brand-solid"
                                    transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 35 }}
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

function TabBarSkeleton() {
    return (
        <div className="ts-tab-bar fixed bottom-0 left-0 right-0 z-50 border-t border-secondary bg-white">
            <div className="mx-auto flex max-w-lg items-center justify-around">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex min-h-[48px] flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5">
                        <div className="size-[22px] rounded-full bg-secondary animate-pulse" />
                        <div className="h-2 w-8 rounded bg-secondary animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function TabBar() {
    return (
        <Suspense fallback={<TabBarSkeleton />}>
            <TabBarInner />
        </Suspense>
    );
}

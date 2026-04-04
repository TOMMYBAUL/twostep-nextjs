"use client";

import { useRef, useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cx } from "@/utils/cx";

const TABS = ["Explorer", "Pour toi", "Suivis"] as const;
export type FeedTab = "explorer" | "pour-toi" | "suivis";

const TAB_MAP: Record<(typeof TABS)[number], FeedTab> = {
    Explorer: "explorer",
    "Pour toi": "pour-toi",
    Suivis: "suivis",
};

interface FeedHeaderProps {
    activeTab: FeedTab;
    onTabChange: (tab: FeedTab) => void;
}

export function FeedHeader({ activeTab, onTabChange }: FeedHeaderProps) {
    const prefersReducedMotion = useReducedMotion();
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
        let nextIndex: number | null = null;
        if (e.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
        else if (e.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
        else if (e.key === "Home") nextIndex = 0;
        else if (e.key === "End") nextIndex = TABS.length - 1;

        if (nextIndex !== null) {
            e.preventDefault();
            const nextTab = TAB_MAP[TABS[nextIndex]];
            onTabChange(nextTab);
            tabRefs.current[nextIndex]?.focus();
        }
    }, [onTabChange]);

    return (
        <div
            className="sticky top-0 z-30 flex border-b border-secondary bg-primary/95 backdrop-blur-md"
            role="tablist"
            aria-label="Feed"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
            {TABS.map((label, index) => {
                const value = TAB_MAP[label];
                const isActive = activeTab === value;
                return (
                    <button
                        key={value}
                        ref={(el) => { tabRefs.current[index] = el; }}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onTabChange(value)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        className={cx(
                            "relative flex-1 py-3 text-center font-[family-name:var(--font-barlow)] text-[14px] font-semibold transition duration-100 ease-linear focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                            isActive
                                ? "text-primary"
                                : "text-tertiary",
                        )}
                    >
                        {label}
                        {isActive && (
                            <motion.div
                                layoutId="feed-tab-indicator"
                                className="absolute bottom-0 left-1/2 h-[2.5px] w-8 -translate-x-1/2 rounded-full bg-brand-solid"
                                transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 30 }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

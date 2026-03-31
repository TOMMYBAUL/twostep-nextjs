"use client";

import { motion } from "motion/react";
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
    return (
        <div
            className="flex border-b border-[var(--ts-border)]"
            role="tablist"
            aria-label="Feed"
        >
            {TABS.map((label) => {
                const value = TAB_MAP[label];
                const isActive = activeTab === value;
                return (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onTabChange(value)}
                        className={cx(
                            "relative flex-1 py-2.5 text-center text-[13px] font-semibold transition duration-100 ease-linear",
                            isActive
                                ? "text-[var(--ts-text)]"
                                : "text-[var(--ts-text-secondary)]",
                        )}
                    >
                        {label}
                        {isActive && (
                            <motion.div
                                layoutId="feed-tab-indicator"
                                className="absolute bottom-0 left-1/2 h-[2.5px] w-8 -translate-x-1/2 rounded-full bg-[var(--ts-accent)]"
                                transition={{ type: "spring", stiffness: 200, damping: 30 }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

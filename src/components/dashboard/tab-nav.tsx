"use client";

import { cx } from "@/utils/cx";

interface Tab {
    id: string;
    label: string;
    disabled?: boolean;
    badge?: string;
}

interface TabNavProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (id: string) => void;
}

export function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
    return (
        <div className="mb-6 flex gap-1 border-b border-secondary" role="tablist">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    disabled={tab.disabled}
                    onClick={() => !tab.disabled && onTabChange(tab.id)}
                    className={cx(
                        "relative px-4 py-3 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                        activeTab === tab.id
                            ? "text-primary"
                            : tab.disabled
                              ? "cursor-not-allowed text-disabled"
                              : "text-quaternary hover:text-secondary",
                    )}
                >
                    {tab.label}
                    {tab.badge && (
                        <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-quaternary">
                            {tab.badge}
                        </span>
                    )}
                    {activeTab === tab.id && (
                        <span className="absolute bottom-0 left-0 h-0.5 w-full bg-primary-solid" />
                    )}
                </button>
            ))}
        </div>
    );
}

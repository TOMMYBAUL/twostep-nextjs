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
        <div className="mb-6 flex gap-1 border-b border-gray-200">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    disabled={tab.disabled}
                    onClick={() => !tab.disabled && onTabChange(tab.id)}
                    className={cx(
                        "relative px-4 py-3 text-[13px] font-semibold transition-colors",
                        activeTab === tab.id
                            ? "text-[var(--ts-accent)]"
                            : tab.disabled
                              ? "cursor-not-allowed text-gray-300"
                              : "text-gray-400 hover:text-gray-600",
                    )}
                >
                    {tab.label}
                    {tab.badge && (
                        <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                            {tab.badge}
                        </span>
                    )}
                    {activeTab === tab.id && (
                        <span className="absolute bottom-0 left-0 h-0.5 w-full" style={{ background: "var(--ts-accent)" }} />
                    )}
                </button>
            ))}
        </div>
    );
}

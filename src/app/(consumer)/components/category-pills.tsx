"use client";

import { useState } from "react";
import { cx } from "@/utils/cx";
import { useCategories } from "@/hooks/use-categories";
import { CategoryDrawer } from "./category-drawer";

interface CategoryPillsProps {
    activeCategory: string | null;
    onCategoryChange: (slug: string | null) => void;
    maxVisible?: number;
}

const PILL_BASE = "shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 transition duration-100 ease-linear";

export function CategoryPills({ activeCategory, onCategoryChange, maxVisible = 6 }: CategoryPillsProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const { data } = useCategories();

    const roots = data?.roots ?? [];
    const visible = roots.slice(0, maxVisible);

    return (
        <>
            <div className="flex gap-1.5 overflow-x-auto px-4 py-2 scrollbar-hide" role="listbox" aria-label="Catégories">
                {/* "Tout" pill */}
                <button
                    type="button"
                    role="option"
                    aria-selected={activeCategory === null}
                    onClick={() => onCategoryChange(null)}
                    className={cx(
                        PILL_BASE,
                        activeCategory === null
                            ? "bg-[var(--ts-accent)] text-white shadow-sm"
                            : "bg-[var(--ts-bg-input)] text-[var(--ts-text)]/60",
                    )}
                >
                    Tout
                </button>

                {/* Category pills */}
                {visible.map((cat) => {
                    const isActive = activeCategory === cat.slug;
                    return (
                        <button
                            key={cat.slug}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onClick={() => onCategoryChange(isActive ? null : cat.slug)}
                            className={cx(
                                PILL_BASE,
                                isActive
                                    ? "bg-[var(--ts-accent)] text-white shadow-sm"
                                    : "bg-[var(--ts-bg-input)] text-[var(--ts-text)]/60",
                            )}
                        >
                            {cat.emoji ? `${cat.emoji} ` : ""}{cat.label}
                        </button>
                    );
                })}

                {/* "Tout ▾" drawer trigger */}
                <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className={cx(
                        PILL_BASE,
                        "border-[1.5px] border-[var(--ts-accent)] text-[var(--ts-accent)] bg-transparent",
                    )}
                >
                    Tout ▾
                </button>
            </div>

            <CategoryDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                activeCategory={activeCategory}
                onCategoryChange={(slug) => {
                    onCategoryChange(slug);
                    setDrawerOpen(false);
                }}
            />
        </>
    );
}

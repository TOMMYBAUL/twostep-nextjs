"use client";

import { useState } from "react";
import { ChevronDown } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { useCategories } from "@/hooks/use-categories";
import { CategoryDrawer } from "./category-drawer";

interface CategoryPillsProps {
    activeCategory: string | null;
    onCategoryChange: (slug: string | null) => void;
    maxVisible?: number;
}

const PILL_BASE = "shrink-0 font-[family-name:var(--font-inter)] text-[12px] font-semibold rounded-full px-3.5 py-2 min-h-[44px] flex items-center transition duration-100 ease-linear focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none";

export function CategoryPills({ activeCategory, onCategoryChange, maxVisible = 6 }: CategoryPillsProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const { data } = useCategories();

    const roots = data?.roots ?? [];
    const visible = roots.slice(0, maxVisible);

    return (
        <>
            <div className="flex gap-2 overflow-x-auto py-1 scrollbar-hide" role="group" aria-label="Catégories">
                {/* "Tout" pill */}
                <button
                    type="button"
                    aria-pressed={activeCategory === null}
                    onClick={() => onCategoryChange(null)}
                    className={cx(
                        PILL_BASE,
                        activeCategory === null
                            ? "bg-primary-solid text-white"
                            : "bg-secondary text-quaternary",
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
                            aria-pressed={isActive}
                            onClick={() => onCategoryChange(isActive ? null : cat.slug)}
                            className={cx(
                                PILL_BASE,
                                isActive
                                    ? "bg-primary-solid text-white"
                                    : "bg-secondary text-quaternary",
                            )}
                        >
                            {cat.label}
                        </button>
                    );
                })}

                {/* "Plus" drawer trigger */}
                <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    aria-label="Voir toutes les catégories"
                    aria-haspopup="dialog"
                    className={cx(
                        PILL_BASE,
                        "border border-secondary text-quaternary bg-primary",
                    )}
                >
                    Plus
                    <ChevronDown className="ml-1 size-3" aria-hidden="true" />
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

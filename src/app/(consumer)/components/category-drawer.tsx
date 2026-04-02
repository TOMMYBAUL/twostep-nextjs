"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronRight } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { useCategories, type Category } from "@/hooks/use-categories";

interface CategoryDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeCategory: string | null;
    onCategoryChange: (slug: string | null) => void;
}

export function CategoryDrawer({ open, onOpenChange, activeCategory, onCategoryChange }: CategoryDrawerProps) {
    const { data } = useCategories();
    const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
    const prefersReducedMotion = useReducedMotion();

    const roots = data?.roots ?? [];
    const children = data?.children ?? new Map();

    const handleRootTap = (slug: string) => {
        const hasChildren = (children.get(slug) ?? []).length > 0;
        if (hasChildren) {
            setExpandedSlug(expandedSlug === slug ? null : slug);
        } else {
            onCategoryChange(slug);
        }
    };

    const isRootActive = (slug: string) => {
        if (activeCategory === slug) return true;
        return (children.get(slug) ?? []).some((c: Category) => c.slug === activeCategory);
    };

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 z-[60] bg-overlay" />
                <Drawer.Content
                    className="fixed bottom-0 left-0 right-0 z-[60] flex flex-col rounded-t-2xl bg-primary focus:outline-none"
                    style={{
                        maxHeight: "85vh",
                        paddingBottom: "env(safe-area-inset-bottom)",
                    }}
                    aria-describedby={undefined}
                >
                    <Drawer.Title className="sr-only">Toutes les catégories</Drawer.Title>

                    {/* Drag handle */}
                    <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-quaternary" />

                    {/* Header */}
                    <div className="shrink-0 px-5 pb-3 pt-4">
                        <h2 className="text-[15px] font-semibold text-primary">Toutes les catégories</h2>
                    </div>

                    {/* Scrollable list */}
                    <div className="overflow-y-auto px-4 pb-6">
                        {roots.map((cat) => {
                            const subs: Category[] = children.get(cat.slug) ?? [];
                            const hasSubs = subs.length > 0;
                            const isExpanded = expandedSlug === cat.slug;
                            const rootActive = isRootActive(cat.slug);

                            return (
                                <div key={cat.slug}>
                                    <button
                                        type="button"
                                        onClick={() => handleRootTap(cat.slug)}
                                        aria-expanded={hasSubs ? isExpanded : undefined}
                                        className={cx(
                                            "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[13px] font-semibold transition duration-100 ease-linear focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                                            rootActive
                                                ? "bg-brand-secondary text-brand-secondary"
                                                : "text-primary hover:bg-secondary",
                                        )}
                                    >
                                        <span>{cat.label}</span>
                                        {hasSubs && (
                                            <ChevronRight
                                                className={cx(
                                                    "size-3.5 transition-transform duration-150",
                                                    isExpanded && "rotate-90",
                                                )}
                                                aria-hidden="true"
                                            />
                                        )}
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {hasSubs && isExpanded && (
                                            <motion.div
                                                key="subs"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: "easeInOut" }}
                                                style={{ overflow: "hidden" }}
                                            >
                                                <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-1" role="group" aria-label={cat.label}>
                                                    {/* "Tout [Category]" pill */}
                                                    <button
                                                        type="button"
                                                        onClick={() => onCategoryChange(cat.slug)}
                                                        aria-pressed={activeCategory === cat.slug}
                                                        className={cx(
                                                            "min-h-[44px] rounded-full px-3 py-2.5 text-[12px] font-semibold transition duration-100 ease-linear focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                                                            activeCategory === cat.slug
                                                                ? "bg-brand-secondary text-brand-secondary"
                                                                : "bg-secondary text-quaternary",
                                                        )}
                                                    >
                                                        Tout {cat.label}
                                                    </button>

                                                    {subs.map((sub) => (
                                                        <button
                                                            key={sub.slug}
                                                            type="button"
                                                            onClick={() => onCategoryChange(sub.slug)}
                                                            aria-pressed={activeCategory === sub.slug}
                                                            className={cx(
                                                                "min-h-[44px] rounded-full px-3 py-2.5 text-[12px] font-semibold transition duration-100 ease-linear focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none",
                                                                activeCategory === sub.slug
                                                                    ? "bg-brand-secondary text-brand-secondary"
                                                                    : "bg-secondary text-quaternary",
                                                            )}
                                                        >
                                                            {sub.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}

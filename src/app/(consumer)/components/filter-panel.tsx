"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { FilterLines } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { useFilterValues } from "@/hooks/use-filter-values";

export interface Filters {
    brand: string | null;
    color: string | null;
    gender: string | null;
    priceMin: number | null;
    priceMax: number | null;
}

interface FilterPanelProps {
    categorySlug: string | null;
    lat: number;
    lng: number;
    filters: Filters;
    onFiltersChange: (filters: Filters) => void;
}

const COLOR_MAP: Record<string, string> = {
    blanc: "#FFFFFF",
    noir: "#111111",
    rouge: "#E53E3E",
    bleu: "#3B82F6",
    vert: "#22C55E",
    jaune: "#EAB308",
    rose: "#EC4899",
    gris: "#9CA3AF",
    marron: "#92400E",
    orange: "#F97316",
    violet: "#8B5CF6",
    beige: "#D4B896",
};

function hasActiveFilters(filters: Filters): boolean {
    return (
        filters.brand !== null ||
        filters.color !== null ||
        filters.gender !== null ||
        filters.priceMin !== null ||
        filters.priceMax !== null
    );
}

export function FilterPanel({ categorySlug, lat, lng, filters, onFiltersChange }: FilterPanelProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<Filters>(filters);

    const { data: filterValues } = useFilterValues(categorySlug, lat, lng);

    if (!categorySlug) return null;

    const brands = filterValues?.filter((f) => f.tag_type === "brand").map((f) => f.tag_value) ?? [];
    const colors = filterValues?.filter((f) => f.tag_type === "color").map((f) => f.tag_value) ?? [];
    const genders = filterValues?.filter((f) => f.tag_type === "gender").map((f) => f.tag_value) ?? [];

    const hasFilters = brands.length > 0 || colors.length > 0 || genders.length > 0;
    if (!hasFilters && !open) return null;

    const isActive = hasActiveFilters(filters);

    const handleOpen = () => {
        setDraft(filters);
        setOpen(true);
    };

    const handleReset = () => {
        setDraft({ brand: null, color: null, gender: null, priceMin: null, priceMax: null });
    };

    const handleApply = () => {
        onFiltersChange(draft);
        setOpen(false);
    };

    return (
        <>
            <button
                type="button"
                aria-label="Filtres"
                onClick={handleOpen}
                className={cx(
                    "flex size-7 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full transition duration-100",
                    isActive
                        ? "bg-brand-solid text-white"
                        : "bg-secondary text-primary/60",
                )}
            >
                <FilterLines className="size-3.5" aria-hidden="true" strokeWidth={2} />
            </button>

            <Drawer.Root open={open} onOpenChange={setOpen}>
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 z-[60] bg-overlay" />
                    <Drawer.Content
                        className="fixed bottom-0 left-0 right-0 z-[60] flex flex-col rounded-t-2xl bg-secondary focus:outline-none"
                        style={{
                            maxHeight: "85vh",
                            paddingBottom: "env(safe-area-inset-bottom)",
                        }}
                        aria-describedby={undefined}
                    >
                        <Drawer.Title className="sr-only">Filtres</Drawer.Title>

                        {/* Drag handle */}
                        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-quaternary" />

                        {/* Header */}
                        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
                            <h2 className="text-[15px] font-semibold text-primary">Filtres</h2>
                            <button
                                type="button"
                                onClick={handleReset}
                                className="text-xs text-primary/50 transition duration-100 hover:text-primary"
                            >
                                Réinitialiser
                            </button>
                        </div>

                        {/* Scrollable content */}
                        <div className="overflow-y-auto px-5 pb-6">
                            {/* Marque */}
                            {brands.length > 0 && (
                                <section className="mb-5">
                                    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-primary/40">
                                        Marque
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {brands.map((brand) => (
                                            <button
                                                key={brand}
                                                type="button"
                                                onClick={() =>
                                                    setDraft((d) => ({ ...d, brand: d.brand === brand ? null : brand }))
                                                }
                                                className={cx(
                                                    "rounded-full px-3 py-1.5 text-xs font-medium transition duration-100",
                                                    draft.brand === brand
                                                        ? "bg-brand-solid text-white"
                                                        : "bg-secondary text-primary/60",
                                                )}
                                            >
                                                {brand}
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Couleur */}
                            {colors.length > 0 && (
                                <section className="mb-5">
                                    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-primary/40">
                                        Couleur
                                    </h3>
                                    <div className="flex flex-wrap gap-2.5">
                                        {colors.map((color) => {
                                            const hex = COLOR_MAP[color.toLowerCase()] ?? "#CCCCCC";
                                            const isSelected = draft.color === color;
                                            return (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    title={color}
                                                    aria-label={color}
                                                    aria-pressed={isSelected}
                                                    onClick={() =>
                                                        setDraft((d) => ({
                                                            ...d,
                                                            color: d.color === color ? null : color,
                                                        }))
                                                    }
                                                    className={cx(
                                                        "size-7 rounded-full border-2 transition duration-100",
                                                        isSelected
                                                            ? "border-brand ring-2 ring-brand/30"
                                                            : "border-transparent",
                                                    )}
                                                    style={{ backgroundColor: hex }}
                                                />
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {/* Genre */}
                            {genders.length > 0 && (
                                <section className="mb-5">
                                    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-primary/40">
                                        Genre
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {genders.map((gender) => (
                                            <button
                                                key={gender}
                                                type="button"
                                                onClick={() =>
                                                    setDraft((d) => ({
                                                        ...d,
                                                        gender: d.gender === gender ? null : gender,
                                                    }))
                                                }
                                                className={cx(
                                                    "rounded-full px-3 py-1.5 text-xs font-medium transition duration-100",
                                                    draft.gender === gender
                                                        ? "bg-brand-solid text-white"
                                                        : "bg-secondary text-primary/60",
                                                )}
                                            >
                                                {gender}
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Prix */}
                            <section className="mb-5">
                                <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-primary/40">
                                    Prix (€)
                                </h3>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        min={0}
                                        placeholder="Min"
                                        value={draft.priceMin ?? ""}
                                        onChange={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                priceMin: e.target.value ? Number(e.target.value) : null,
                                            }))
                                        }
                                        className="w-full rounded-lg border border-secondary bg-secondary px-3 py-2 text-xs text-primary placeholder:text-primary/30 focus:outline-none focus:ring-1 focus:ring-brand"
                                    />
                                    <span className="shrink-0 text-xs text-primary/40">—</span>
                                    <input
                                        type="number"
                                        min={0}
                                        placeholder="Max"
                                        value={draft.priceMax ?? ""}
                                        onChange={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                priceMax: e.target.value ? Number(e.target.value) : null,
                                            }))
                                        }
                                        className="w-full rounded-lg border border-secondary bg-secondary px-3 py-2 text-xs text-primary placeholder:text-primary/30 focus:outline-none focus:ring-1 focus:ring-brand"
                                    />
                                </div>
                            </section>
                        </div>

                        {/* Apply button */}
                        <div className="shrink-0 border-t border-secondary px-5 py-3">
                            <button
                                type="button"
                                onClick={handleApply}
                                className="w-full rounded-xl bg-brand-solid py-3 text-[13px] font-semibold text-white transition duration-100 active:opacity-80"
                            >
                                Voir les résultats
                            </button>
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        </>
    );
}

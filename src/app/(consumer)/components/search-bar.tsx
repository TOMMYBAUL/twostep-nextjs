"use client";

import { SearchMd, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useAutocomplete } from "../hooks/use-search";
import { cx } from "@/utils/cx";

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
}

export function SearchBar({ value, onChange, onSubmit }: SearchBarProps) {
    const [isFocused, setIsFocused] = useState(false);
    const { data: suggestions } = useAutocomplete(isFocused ? value : "");

    return (
        <div className="relative">
            <div
                className={cx(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition duration-100",
                    isFocused ? "border-[var(--ts-ochre)] shadow-[0_0_0_3px_rgba(66,104,255,0.15)]" : "border-secondary",
                )}
            >
                <SearchMd className="size-5 text-quaternary" aria-hidden="true" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && onSubmit) onSubmit(value);
                    }}
                    placeholder="Nike Air Max, iPhone 15, Levi's 501..."
                    className="flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-placeholder"
                    aria-label="Rechercher un produit"
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        className="text-quaternary hover:text-secondary"
                        aria-label="Effacer la recherche"
                    >
                        <XClose className="size-4" />
                    </button>
                )}
            </div>
            <AnimatePresence>
                {isFocused && suggestions && suggestions.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-secondary bg-primary shadow-lg"
                    >
                        {suggestions.map((s, i) => (
                            <button
                                key={`${s.suggestion_type}-${s.suggestion}-${i}`}
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-secondary"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    onChange(s.suggestion);
                                    onSubmit?.(s.suggestion);
                                }}
                            >
                                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-tertiary">
                                    {s.suggestion_type === "product" ? "Produit" : s.suggestion_type === "brand" ? "Marque" : "Catégorie"}
                                </span>
                                <span>{s.suggestion}</span>
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

"use client";

import { SearchMd, XClose } from "@untitledui/icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, useRef, useCallback } from "react";
import { useAutocomplete } from "../hooks/use-search";
import { cx } from "@/utils/cx";

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
}

export function SearchBar({ value, onChange, onSubmit }: SearchBarProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const isSelectingRef = useRef(false);
    const prefersReducedMotion = useReducedMotion();
    const { data: suggestions } = useAutocomplete(isFocused ? value : "");
    const listId = "search-suggestions";

    const handleBlur = useCallback(() => {
        // Delay to allow click/pointer events on suggestions to fire
        setTimeout(() => {
            if (!isSelectingRef.current) {
                setIsFocused(false);
                setActiveIndex(-1);
            }
            isSelectingRef.current = false;
        }, 300);
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!suggestions || suggestions.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % suggestions.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
        } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            const selected = suggestions[activeIndex];
            onChange(selected.suggestion);
            onSubmit?.(selected.suggestion);
            setIsFocused(false);
            setActiveIndex(-1);
        } else if (e.key === "Escape") {
            setIsFocused(false);
            setActiveIndex(-1);
        } else if (e.key === "Enter" && onSubmit) {
            onSubmit(value);
        }
    }, [suggestions, activeIndex, onChange, onSubmit, value]);

    const showSuggestions = isFocused && suggestions && suggestions.length > 0;

    return (
        <div className="relative">
            <div
                className={cx(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition duration-100",
                    isFocused ? "border-brand shadow-[0_0_0_3px_rgba(66,104,255,0.15)]" : "border-secondary",
                )}
            >
                <SearchMd className="size-5 text-quaternary" aria-hidden="true" />
                <input
                    type="search"
                    role="combobox"
                    aria-expanded={!!showSuggestions}
                    aria-controls={listId}
                    aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
                    aria-autocomplete="list"
                    value={value}
                    onChange={(e) => { onChange(e.target.value); setActiveIndex(-1); }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    placeholder="Nike Air Max, iPhone 15, Levi's 501..."
                    className="flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-placeholder"
                    aria-label="Rechercher un produit"
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-quaternary hover:text-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                        aria-label="Effacer la recherche"
                    >
                        <XClose className="size-4" />
                    </button>
                )}
            </div>
            <AnimatePresence>
                {showSuggestions && (
                    <motion.div
                        initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                        id={listId}
                        role="listbox"
                        className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-secondary bg-primary shadow-lg"
                    >
                        {suggestions!.map((s, i) => (
                            <button
                                key={`${s.suggestion_type}-${s.suggestion}`}
                                id={`suggestion-${i}`}
                                role="option"
                                aria-selected={i === activeIndex}
                                type="button"
                                className={cx(
                                    "flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                                    i === activeIndex && "bg-secondary",
                                )}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    isSelectingRef.current = true;
                                    onChange(s.suggestion);
                                    onSubmit?.(s.suggestion);
                                    setIsFocused(false);
                                    setActiveIndex(-1);
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

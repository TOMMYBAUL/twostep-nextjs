"use client";

import { cx } from "@/utils/cx";

interface FilterPillsProps {
    options: string[];
    selected: string | null;
    onSelect: (value: string | null) => void;
}

export function FilterPills({ options, selected, onSelect }: FilterPillsProps) {
    return (
        <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-hide" role="listbox" aria-label="Filtres">
            <button
                type="button"
                role="option"
                aria-selected={selected === null}
                onClick={() => onSelect(null)}
                className={cx(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition duration-100",
                    selected === null
                        ? "bg-[var(--ts-ochre)] text-white"
                        : "bg-secondary text-secondary hover:bg-tertiary",
                )}
            >
                Tout
            </button>
            {options.map((option) => (
                <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={selected === option}
                    onClick={() => onSelect(selected === option ? null : option)}
                    className={cx(
                        "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition duration-100",
                        selected === option
                            ? "bg-[var(--ts-ochre)] text-white"
                            : "bg-secondary text-secondary hover:bg-tertiary",
                    )}
                >
                    {option}
                </button>
            ))}
        </div>
    );
}

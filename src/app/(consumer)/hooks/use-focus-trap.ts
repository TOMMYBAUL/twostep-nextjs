"use client";

import { useEffect, useRef } from "react";

export function useFocusTrap(isOpen: boolean) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !containerRef.current) return;

        const container = containerRef.current;
        const focusableSelector =
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;

            const focusable = container.querySelectorAll(focusableSelector);
            if (focusable.length === 0) return;

            const first = focusable[0] as HTMLElement;
            const last = focusable[focusable.length - 1] as HTMLElement;

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        container.addEventListener("keydown", handleKeyDown);

        // Focus first focusable element
        const firstFocusable = container.querySelector(
            focusableSelector,
        ) as HTMLElement;
        firstFocusable?.focus();

        return () => container.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    return containerRef;
}

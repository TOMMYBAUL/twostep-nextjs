"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "cookie_consent";

export type ConsentValue = "accepted" | "refused" | null;

function getSnapshot(): ConsentValue {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "accepted" || v === "refused") return v;
    return null;
}

function getServerSnapshot(): ConsentValue {
    return null;
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function setConsent(value: "accepted" | "refused") {
    localStorage.setItem(STORAGE_KEY, value);
    listeners.forEach((cb) => cb());
}

export function useConsent() {
    const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const accept = useCallback(() => setConsent("accepted"), []);
    const refuse = useCallback(() => setConsent("refused"), []);

    return { consent, accept, refuse, hasChosen: consent !== null };
}

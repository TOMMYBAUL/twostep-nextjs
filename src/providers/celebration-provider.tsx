"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { AchievementDef } from "@/lib/achievements";

type CelebrationItem = AchievementDef & { achievementId: string };

type CelebrationContextValue = {
    current: CelebrationItem | null;
    enqueue: (item: CelebrationItem) => void;
    dismiss: () => void;
};

const CelebrationContext = createContext<CelebrationContextValue>({
    current: null,
    enqueue: () => {},
    dismiss: () => {},
});

export function CelebrationProvider({ children }: { children: ReactNode }) {
    const [queue, setQueue] = useState<CelebrationItem[]>([]);
    const current = queue[0] ?? null;

    const enqueue = useCallback((item: CelebrationItem) => {
        setQueue((prev) => {
            if (prev.some((p) => p.type === item.type)) return prev;
            return [...prev, item];
        });
    }, []);

    const dismiss = useCallback(() => {
        setQueue((prev) => prev.slice(1));
    }, []);

    return (
        <CelebrationContext.Provider value={{ current, enqueue, dismiss }}>
            {children}
        </CelebrationContext.Provider>
    );
}

export function useCelebration() {
    return useContext(CelebrationContext);
}

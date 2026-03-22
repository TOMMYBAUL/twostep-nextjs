"use client";

import { useCallback, useState } from "react";
import { Drawer } from "vaul";

interface BottomSheetProps {
    children: React.ReactNode;
}

const SNAP_POINTS = ["180px", "50%", 1] as const;
const MIN_SNAP = SNAP_POINTS[0];

export function BottomSheet({ children }: BottomSheetProps) {
    const [snap, setSnap] = useState<string | number | null>(MIN_SNAP);

    // Never let the sheet disappear — force back to minimum
    const handleSnapChange = useCallback((point: string | number | null) => {
        setSnap(point ?? MIN_SNAP);
    }, []);

    return (
        <Drawer.Root
            open
            modal={false}
            snapPoints={[...SNAP_POINTS]}
            activeSnapPoint={snap}
            setActiveSnapPoint={handleSnapChange}
            dismissible={false}
            fadeFromIndex={0}
        >
            <Drawer.Portal>
                <Drawer.Content
                    className="fixed bottom-0 left-0 right-0 z-40 flex max-h-[90dvh] flex-col rounded-t-2xl border-t border-secondary bg-primary shadow-xl outline-none"
                    aria-describedby={undefined}
                >
                    <Drawer.Title className="sr-only">Boutiques à proximité</Drawer.Title>
                    {/* Large touch target — always visible, easy to grab */}
                    <div
                        className="flex shrink-0 cursor-grab touch-none items-center justify-center py-4 active:cursor-grabbing"
                        onDoubleClick={() => setSnap(snap === MIN_SNAP ? "50%" : MIN_SNAP)}
                    >
                        <div className="h-1.5 w-12 rounded-full bg-quaternary" />
                    </div>
                    <div className="flex-1 overflow-y-auto pb-4">{children}</div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}

"use client";

import { useState } from "react";
import { Drawer } from "vaul";

interface BottomSheetProps {
    children: React.ReactNode;
}

const SNAP_POINTS = ["180px", "50%", 1] as const;

export function BottomSheet({ children }: BottomSheetProps) {
    const [snap, setSnap] = useState<string | number | null>("180px");

    return (
        <Drawer.Root
            open
            modal={false}
            snapPoints={[...SNAP_POINTS]}
            activeSnapPoint={snap}
            setActiveSnapPoint={setSnap}
            dismissible={false}
        >
            <Drawer.Portal>
                <Drawer.Content
                    className="fixed bottom-0 left-0 right-0 z-40 flex max-h-[90dvh] flex-col rounded-t-2xl border-t border-secondary bg-primary shadow-xl outline-none"
                    aria-describedby={undefined}
                >
                    <Drawer.Title className="sr-only">Boutiques à proximité</Drawer.Title>
                    <Drawer.Handle className="mx-auto mt-3 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-quaternary" />
                    <div className="flex-1 overflow-y-auto pb-4">{children}</div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}

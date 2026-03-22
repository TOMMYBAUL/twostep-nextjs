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
                    className="fixed bottom-0 left-0 right-0 z-40 flex flex-col rounded-t-2xl border-t border-secondary bg-primary shadow-xl outline-none"
                    style={{ maxHeight: "90dvh" }}
                    aria-describedby={undefined}
                >
                    <Drawer.Title className="sr-only">Boutiques à proximité</Drawer.Title>
                    <div className="flex justify-center py-3">
                        <div className="h-1 w-10 rounded-full bg-quaternary" />
                    </div>
                    <div className="flex-1 overflow-y-auto">{children}</div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}

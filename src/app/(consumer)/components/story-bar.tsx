"use client";

import { useState } from "react";
import Image from "next/image";
import { StoryViewer } from "./story-viewer";

interface Story {
    id: string;
    merchant_id: string;
    image_url: string;
    caption: string | null;
    created_at: string;
    merchants: { name: string; photo_url: string | null } | null;
}

interface StoryGroup {
    merchant_id: string;
    merchant_name: string;
    merchant_photo: string | null;
    stories: Story[];
}

export function StoryBar({ stories }: { stories: Story[] }) {
    const [viewerOpen, setViewerOpen] = useState(false);
    const [activeGroupIndex, setActiveGroupIndex] = useState(0);

    if (!stories || stories.length === 0) return null;

    // Group stories by merchant
    const groupMap = new Map<string, StoryGroup>();
    for (const s of stories) {
        const existing = groupMap.get(s.merchant_id);
        if (existing) {
            existing.stories.push(s);
        } else {
            groupMap.set(s.merchant_id, {
                merchant_id: s.merchant_id,
                merchant_name: s.merchants?.name ?? "Boutique",
                merchant_photo: s.merchants?.photo_url ?? null,
                stories: [s],
            });
        }
    }
    const groups = Array.from(groupMap.values());

    const openViewer = (groupIndex: number) => {
        setActiveGroupIndex(groupIndex);
        setViewerOpen(true);
    };

    return (
        <>
            <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">
                {groups.map((group, i) => (
                    <button
                        key={group.merchant_id}
                        type="button"
                        onClick={() => openViewer(i)}
                        className="flex shrink-0 flex-col items-center gap-1"
                    >
                        <div className="rounded-full bg-gradient-to-br from-[#4268FF] to-[#7B93FF] p-[3px]">
                            <div className="flex size-14 items-center justify-center overflow-hidden rounded-full border-2 border-[#F8F9FC] bg-[#F0F1F5]">
                                {group.merchant_photo ? (
                                    <Image src={group.merchant_photo} alt="" width={56} height={56} className="h-full w-full object-cover" />
                                ) : (
                                    <span className="text-lg font-bold text-[#4268FF]">
                                        {group.merchant_name.charAt(0)}
                                    </span>
                                )}
                            </div>
                        </div>
                        <span className="max-w-14 truncate text-center text-[9px] text-[#8E96B0]">
                            {group.merchant_name}
                        </span>
                    </button>
                ))}
            </div>

            {viewerOpen && (
                <StoryViewer
                    groups={groups}
                    initialGroupIndex={activeGroupIndex}
                    onClose={() => setViewerOpen(false)}
                />
            )}
        </>
    );
}

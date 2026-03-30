"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { XClose } from "@untitledui/icons";
import Link from "next/link";
import { generateSlug } from "@/lib/slug";

interface Story {
    id: string;
    merchant_id: string;
    image_url: string;
    caption: string | null;
    created_at: string;
}

interface StoryGroup {
    merchant_id: string;
    merchant_name: string;
    merchant_photo: string | null;
    stories: Story[];
}

export function StoryViewer({
    groups,
    initialGroupIndex,
    onClose,
}: {
    groups: StoryGroup[];
    initialGroupIndex: number;
    onClose: () => void;
}) {
    const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
    const [storyIndex, setStoryIndex] = useState(0);

    const group = groups[groupIndex];
    const story = group?.stories[storyIndex];

    const goNext = useCallback(() => {
        if (storyIndex < group.stories.length - 1) {
            setStoryIndex(storyIndex + 1);
        } else if (groupIndex < groups.length - 1) {
            setGroupIndex(groupIndex + 1);
            setStoryIndex(0);
        } else {
            onClose();
        }
    }, [storyIndex, groupIndex, group, groups, onClose]);

    const goPrev = useCallback(() => {
        if (storyIndex > 0) {
            setStoryIndex(storyIndex - 1);
        } else if (groupIndex > 0) {
            setGroupIndex(groupIndex - 1);
            setStoryIndex(groups[groupIndex - 1].stories.length - 1);
        }
    }, [storyIndex, groupIndex, groups]);

    // Auto-advance after 5 seconds
    useEffect(() => {
        const timer = setTimeout(goNext, 5000);
        return () => clearTimeout(timer);
    }, [goNext]);

    if (!story) return null;

    const timeAgo = Math.round((Date.now() - new Date(story.created_at).getTime()) / 3600_000);
    const timeText = timeAgo < 1 ? "il y a moins d'1h" : `il y a ${timeAgo}h`;
    const shopSlug = generateSlug(group.merchant_name, group.merchant_id);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black"
            >
                {/* Progress bars */}
                <div className="absolute left-2 right-2 top-10 z-10 flex gap-1">
                    {group.stories.map((_, i) => (
                        <div key={i} className="h-[2px] flex-1 rounded-full" style={{ background: i <= storyIndex ? "white" : "rgba(255,255,255,0.3)" }} />
                    ))}
                </div>

                {/* Header */}
                <div className="absolute left-3 right-3 top-14 z-10 flex items-center gap-2">
                    <Link href={`/shop/${shopSlug}`} onClick={onClose} className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-[#F0F1F5]">
                            {group.merchant_photo ? (
                                <img src={group.merchant_photo} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <span className="text-sm font-bold text-[#4268FF]">{group.merchant_name.charAt(0)}</span>
                            )}
                        </div>
                        <div>
                            <p className="text-[13px] font-semibold text-white">{group.merchant_name}</p>
                            <p className="text-[10px] text-white/60">{timeText}</p>
                        </div>
                    </Link>
                    <button type="button" onClick={onClose} className="ml-auto flex size-8 items-center justify-center rounded-full bg-black/30">
                        <XClose className="size-4 text-white" />
                    </button>
                </div>

                {/* Image */}
                <img
                    src={story.image_url}
                    alt=""
                    className="h-full w-full object-contain"
                />

                {/* Tap zones */}
                <div className="absolute inset-0 flex" onClick={(e) => e.stopPropagation()}>
                    <div className="w-1/3" onClick={goPrev} />
                    <div className="w-1/3" />
                    <div className="w-1/3" onClick={goNext} />
                </div>

                {/* Caption */}
                {story.caption && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-8 pt-16">
                        <p className="text-[14px] leading-relaxed text-white">{story.caption}</p>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}

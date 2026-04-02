"use client";

import { cx } from "@/utils/cx";

function Bone({ className, delay = 0 }: { className?: string; delay?: number }) {
    return (
        <div
            className={cx("animate-pulse rounded-md bg-[var(--ts-bg-input)]", className)}
            style={{ animationDelay: `${delay}ms` }}
        />
    );
}

/** Skeleton for a product card in a 2-col grid */
export function ProductCardSkeleton({ index = 0 }: { index?: number }) {
    const d = index * 200;
    return (
        <div className="overflow-hidden rounded-[10px]">
            <Bone className="aspect-[3/4] w-full rounded-[10px]" delay={d} />
            <div className="px-1 pt-2.5">
                <Bone className="h-3.5 w-[75%]" delay={d + 50} />
                <Bone className="mt-1.5 h-2.5 w-[55%]" delay={d + 100} />
                <Bone className="mt-1.5 h-3 w-12" delay={d + 150} />
            </div>
        </div>
    );
}

/** Skeleton for a promo row card */
export function PromoCardSkeleton({ index = 0 }: { index?: number }) {
    const d = index * 200;
    return (
        <div className="flex items-center rounded-[10px] bg-[var(--ts-bg-input)] p-2.5" style={{ gap: 10 }}>
            <Bone className="size-16 shrink-0 rounded-lg" delay={d} />
            <div className="flex-1">
                <Bone className="h-3 w-24" delay={d + 50} />
                <Bone className="mt-1.5 h-3 w-[80%]" delay={d + 100} />
                <Bone className="mt-1.5 h-2.5 w-10" delay={d + 150} />
            </div>
        </div>
    );
}

/** Skeleton for a section header */
export function SectionHeaderSkeleton() {
    return (
        <div className="flex items-center gap-2.5 px-4">
            <Bone className="size-8 rounded-xl" />
            <div>
                <Bone className="h-3.5 w-32" delay={50} />
                <Bone className="mt-1 h-2.5 w-44" delay={100} />
            </div>
        </div>
    );
}

/** Full explorer tab skeleton */
export function ExplorerSkeleton() {
    return (
        <div className="flex flex-col gap-5 pb-24 pt-4">
            <section>
                <SectionHeaderSkeleton />
                <div className="mt-3 px-3.5">
                    <PromoCardSkeleton index={0} />
                </div>
            </section>
            <section>
                <SectionHeaderSkeleton />
                <div className="mt-3 grid grid-cols-2 gap-2 px-4">
                    {[0, 1, 2, 3].map((i) => (
                        <ProductCardSkeleton key={i} index={i} />
                    ))}
                </div>
            </section>
        </div>
    );
}

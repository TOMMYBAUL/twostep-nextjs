export default function ConsumerLoading() {
    return (
        <div className="min-h-[60dvh] bg-secondary px-4 pt-6">
            {/* Header skeleton */}
            <div className="flex items-center gap-3">
                <div className="size-8 animate-pulse rounded-lg bg-tertiary" />
                <div className="h-5 w-32 animate-pulse rounded-lg bg-tertiary" />
            </div>

            {/* Horizontal scroll section skeleton */}
            <div className="mt-6 space-y-3">
                <div className="h-4 w-40 animate-pulse rounded-lg bg-tertiary" />
                <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="w-40 shrink-0 space-y-2">
                            <div className="aspect-square w-full animate-pulse rounded-xl bg-tertiary" />
                            <div className="h-3 w-24 animate-pulse rounded bg-tertiary" />
                            <div className="h-3 w-16 animate-pulse rounded bg-tertiary" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Grid section skeleton */}
            <div className="mt-8 space-y-3">
                <div className="h-4 w-36 animate-pulse rounded-lg bg-tertiary" />
                <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                            <div className="aspect-square w-full animate-pulse rounded-xl bg-tertiary" />
                            <div className="h-3 w-20 animate-pulse rounded bg-tertiary" />
                            <div className="h-3 w-14 animate-pulse rounded bg-tertiary" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function Loading() {
    return (
        <div className="animate-pulse space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div className="h-8 w-48 rounded bg-tertiary" />
                <div className="h-9 w-32 rounded-lg bg-tertiary" />
            </div>
            <div className="rounded-xl border border-secondary bg-primary">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 border-b border-secondary p-4">
                        <div className="size-10 rounded-lg bg-secondary" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-40 rounded bg-tertiary" />
                            <div className="h-3 w-24 rounded bg-secondary" />
                        </div>
                        <div className="h-4 w-16 rounded bg-secondary" />
                    </div>
                ))}
            </div>
        </div>
    );
}

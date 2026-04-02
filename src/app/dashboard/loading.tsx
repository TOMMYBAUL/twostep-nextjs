export default function DashboardLoading() {
    return (
        <div className="animate-pulse space-y-6 p-6">
            {/* Page title */}
            <div className="h-8 w-48 rounded bg-tertiary" />
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-secondary bg-primary p-4">
                        <div className="h-4 w-20 rounded bg-tertiary" />
                        <div className="mt-2 h-7 w-16 rounded bg-secondary" />
                    </div>
                ))}
            </div>
            {/* Table skeleton */}
            <div className="rounded-xl border border-secondary bg-primary">
                <div className="border-b border-secondary p-4">
                    <div className="h-5 w-32 rounded bg-tertiary" />
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
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

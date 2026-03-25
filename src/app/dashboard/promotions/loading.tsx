export default function Loading() {
    return (
        <div className="animate-pulse space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div className="h-8 w-48 rounded bg-gray-200" />
                <div className="h-9 w-32 rounded-lg bg-gray-200" />
            </div>
            <div className="rounded-xl border border-gray-100 bg-white">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 border-b border-gray-50 p-4">
                        <div className="size-10 rounded-lg bg-gray-100" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-40 rounded bg-gray-200" />
                            <div className="h-3 w-24 rounded bg-gray-100" />
                        </div>
                        <div className="h-4 w-16 rounded bg-gray-100" />
                    </div>
                ))}
            </div>
        </div>
    );
}

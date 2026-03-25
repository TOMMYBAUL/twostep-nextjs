export default function Loading() {
    return (
        <div className="animate-pulse space-y-6 p-6">
            <div className="h-8 w-48 rounded bg-gray-200" />
            <div className="max-w-2xl space-y-4 rounded-xl border border-gray-100 bg-white p-6">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                        <div className="h-4 w-24 rounded bg-gray-200" />
                        <div className="h-10 w-full rounded-lg bg-gray-100" />
                    </div>
                ))}
                <div className="h-10 w-32 rounded-lg bg-gray-200" />
            </div>
        </div>
    );
}

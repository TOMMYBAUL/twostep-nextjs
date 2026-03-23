export default function ConsumerLoading() {
    return (
        <div className="flex min-h-[60dvh] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="size-8 animate-spin rounded-full border-2 border-[var(--ts-cream-dark)] border-t-[var(--ts-ochre)]" />
                <p className="text-xs font-medium text-[var(--ts-brown-mid)]/40">Chargement...</p>
            </div>
        </div>
    );
}

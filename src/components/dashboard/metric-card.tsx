interface MetricCardProps {
    label: string;
    value: number;
    variant?: "default" | "warn" | "danger";
    staggerIndex?: number;
}

export function MetricCard({ label, value, variant = "default", staggerIndex = 0 }: MetricCardProps) {
    const colorClass =
        variant === "danger"
            ? "text-red-600"
            : variant === "warn"
              ? "text-[var(--ts-accent)]"
              : "text-gray-900";

    return (
        <div
            className={`animate-fade-up rounded-[10px] p-5 stagger-${staggerIndex + 1}`}
            style={{ background: "var(--ts-bg-card)" }}
        >
            <p className="mb-1.5 text-xs font-medium text-gray-500">{label}</p>
            <p className={`text-[28px] font-bold ${colorClass}`}>{value}</p>
        </div>
    );
}

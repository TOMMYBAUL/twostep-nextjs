interface MetricCardProps {
    label: string;
    value: number;
    variant?: "default" | "warn" | "danger";
    staggerIndex?: number;
}

export function MetricCard({ label, value, variant = "default", staggerIndex = 0 }: MetricCardProps) {
    const colorClass =
        variant === "danger"
            ? "text-error-primary"
            : variant === "warn"
              ? "text-brand-secondary"
              : "text-primary";

    return (
        <div
            className={`animate-fade-up rounded-[10px] p-5 bg-secondary stagger-${staggerIndex + 1}`}
        >
            <p className="mb-1.5 text-xs font-medium text-tertiary">{label}</p>
            <p className={`text-[28px] font-bold ${colorClass}`}>{value}</p>
        </div>
    );
}

import type { ReactNode } from "react";

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description: string;
    action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="animate-fade-up stagger-3 flex flex-col items-center justify-center rounded-2xl py-16" style={{ background: "var(--ts-bg-card)" }}>
            {icon && <div className="mb-4 text-4xl">{icon}</div>}
            <h3 className="mb-1 text-base font-semibold text-gray-900">{title}</h3>
            <p className="mb-6 text-sm text-gray-500">{description}</p>
            {action}
        </div>
    );
}

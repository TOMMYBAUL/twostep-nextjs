"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
    storeName?: string;
    title: string;
    titleAccent?: string;
    action?: ReactNode;
}

export function PageHeader({ storeName, title, titleAccent, action }: PageHeaderProps) {
    return (
        <div className="mb-6">
            {storeName && (
                <p className="animate-fade-up mb-1 text-[11px] font-semibold uppercase tracking-wider text-quaternary">
                    {storeName}
                </p>
            )}
            <div className="animate-fade-up stagger-1 flex items-center justify-between">
                <h1 className="font-display text-[26px] font-bold uppercase text-primary">
                    {title}{" "}
                    {titleAccent && (
                        <span className="text-brand-secondary">{titleAccent}</span>
                    )}
                </h1>
                {action}
            </div>
        </div>
    );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usePosSyncStatus } from "@/hooks/use-pos-sync-status";

const tabs = [
    { href: "/dashboard/stock/mon-stock", label: "Mon stock", subtitle: "Produits + ruptures" },
    { href: "/dashboard/stock/factures", label: "Factures", subtitle: "Fournisseur à valider" },
    { href: "/dashboard/stock/pos", label: "Sync POS", subtitle: "Caisse connectée" },
] as const;

export function StockNavTabs() {
    const pathname = usePathname();
    const { status } = usePosSyncStatus();

    return (
        <div className="animate-fade-up mb-6 flex gap-1 rounded-xl bg-secondary p-1">
            {tabs.map((tab) => {
                const isActive = pathname.startsWith(tab.href);
                const dotClass = tab.href === "/dashboard/stock/pos" && status
                    ? status.state === "ok"
                        ? "bg-success-solid"
                        : status.state === "problem"
                            ? "bg-error-solid"
                            : "bg-warning-solid"
                    : null;

                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-3 py-2.5 min-h-[44px] text-center transition no-underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
                            isActive ? "bg-primary text-primary shadow-sm" : "text-tertiary hover:text-secondary"
                        }`}
                    >
                        <span className={`flex items-center gap-1.5 text-sm ${isActive ? "font-semibold" : "font-medium"}`}>
                            {tab.label}
                            {dotClass && <span className={`size-1.5 rounded-full ${dotClass}`} aria-hidden="true" />}
                        </span>
                        <span className="text-[10px] text-tertiary">{tab.subtitle}</span>
                    </Link>
                );
            })}
        </div>
    );
}

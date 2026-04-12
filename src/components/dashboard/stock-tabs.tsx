"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
    { href: "/dashboard/products", label: "Catalogue", subtitle: "Mes produits" },
    { href: "/dashboard/invoices", label: "Entrées", subtitle: "Stock fournisseur" },
    { href: "/dashboard/recap", label: "Ventes", subtitle: "Stock sortant" },
];

export function StockTabs() {
    const pathname = usePathname();

    return (
        <div className="animate-fade-up mb-6 flex gap-1 rounded-xl bg-secondary p-1">
            {tabs.map((tab) => {
                const isActive = pathname.startsWith(tab.href);
                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-3 py-2.5 min-h-[44px] text-center transition no-underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
                            isActive
                                ? "bg-primary text-primary shadow-sm"
                                : "text-tertiary hover:text-secondary"
                        }`}
                    >
                        <span className={`text-sm ${isActive ? "font-semibold" : "font-medium"}`}>
                            {tab.label}
                        </span>
                        <span className="text-[10px] text-tertiary">
                            {tab.subtitle}
                        </span>
                    </Link>
                );
            })}
        </div>
    );
}

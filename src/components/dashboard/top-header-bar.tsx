"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useMerchant } from "@/hooks/use-merchant";
import { generateSlug } from "@/lib/slug";

const breadcrumbLabels: Record<string, string> = {
    "/dashboard": "Accueil",
    "/dashboard/products": "Produits",
    "/dashboard/promotions": "Promotions",
    "/dashboard/store": "Ma boutique",
    "/dashboard/settings": "Réglages",
    "/dashboard/achievements": "Trophées",
    "/dashboard/tips-history": "Historique tips",
    "/dashboard/invoices": "Factures",
    "/dashboard/google": "Google",
};

export function TopHeaderBar() {
    const pathname = usePathname();
    const { merchant } = useMerchant();
    const [menuOpen, setMenuOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const notifRef = useRef<HTMLDivElement>(null);

    const pageLabel = Object.entries(breadcrumbLabels)
        .filter(([path]) => pathname.startsWith(path))
        .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? "Dashboard";

    const initials = merchant?.name
        ? merchant.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
        : "TS";

    const shopSlug = merchant
        ? (merchant.slug ?? generateSlug(merchant.name, merchant.id))
        : null;

    // Close dropdowns on click outside
    useEffect(() => {
        if (!menuOpen && !notifOpen) return;
        function handleClick(e: MouseEvent) {
            if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
            if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setNotifOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [menuOpen, notifOpen]);

    return (
        <div className="hidden lg:flex h-[52px] items-center border-b border-secondary bg-primary px-5 gap-3">
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px]">
                <span className="text-tertiary">Dashboard</span>
                <span className="text-tertiary" aria-hidden="true">›</span>
                <span className="font-semibold text-primary">{pageLabel}</span>
            </nav>

            <div className="flex-1" />

            {/* Actions */}
            <div className="flex items-center gap-2">
                {/* Notification bell */}
                <div className="relative" ref={notifRef}>
                    <button
                        onClick={() => setNotifOpen(!notifOpen)}
                        aria-label="Notifications"
                        className="flex size-8 items-center justify-center rounded-full bg-brand-secondary transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                        <svg className="size-4 text-tertiary" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                    </button>
                    {notifOpen && (
                        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl bg-primary py-4 px-5 shadow-lg border border-secondary text-center">
                            <div className="text-2xl mb-2" aria-hidden="true">🔔</div>
                            <p className="text-xs font-semibold text-primary">Pas de notification</p>
                            <p className="text-[10px] text-tertiary mt-1">Vous serez notifié quand un client vous suit ou met un produit en favori.</p>
                        </div>
                    )}
                </div>

                {/* Avatar + dropdown menu */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        aria-label="Menu utilisateur"
                        className="flex size-8 items-center justify-center rounded-full bg-tertiary text-[11px] font-bold text-white transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                    >
                        {initials}
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-10 z-50 w-52 rounded-xl bg-primary py-2 shadow-lg border border-secondary">
                            {/* Merchant name header */}
                            {merchant && (
                                <div className="px-4 py-2 border-b border-tertiary">
                                    <p className="text-xs font-semibold text-primary truncate">{merchant.name}</p>
                                    <p className="text-[10px] text-tertiary truncate">{merchant.address}</p>
                                </div>
                            )}

                            <Link
                                href="/dashboard/store"
                                onClick={() => setMenuOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-primary no-underline transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            >
                                <svg className="size-4 text-tertiary" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                                Mon profil
                            </Link>

                            {shopSlug && (
                                <a
                                    href={`/shop/${shopSlug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setMenuOpen(false)}
                                    className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-primary no-underline transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                >
                                    <svg className="size-4 text-tertiary" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                    Voir ma boutique
                                </a>
                            )}

                            <a
                                href="mailto:contact@twostep.fr"
                                onClick={() => setMenuOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-primary no-underline transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            >
                                <svg className="size-4 text-tertiary" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                Support
                            </a>

                            <Link
                                href="/mentions-legales"
                                onClick={() => setMenuOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-primary no-underline transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            >
                                <svg className="size-4 text-tertiary" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                                    <path d="M14 2v6h6" />
                                </svg>
                                Mentions légales
                            </Link>
                            <Link
                                href="/confidentialite"
                                onClick={() => setMenuOpen(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-primary no-underline transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            >
                                <svg className="size-4 text-tertiary" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                Confidentialité
                            </Link>

                            <div className="my-1 border-t border-tertiary" />

                            <button
                                onClick={() => { setMenuOpen(false); window.location.href = "/auth/logout"; }}
                                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs text-error-primary transition hover:bg-error-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            >
                                <svg className="size-4" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                Déconnexion
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

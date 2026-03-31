"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "vaul";

const moreItems = [
    {
        href: "/dashboard/stock",
        label: "Stock",
        icon: (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
        ),
    },
    {
        href: "/dashboard/achievements",
        label: "Trophées",
        icon: (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
        ),
    },
    {
        href: "/dashboard/stories",
        label: "Stories",
        icon: (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="10" r="3" />
                <path d="M6 21v-1a6 6 0 0 1 12 0v1" />
            </svg>
        ),
    },
    {
        href: "/dashboard/google",
        label: "Google",
        icon: (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4l3 3" />
                <path d="M16.51 17.35l-.35 3.83a2 2 0 0 1-1.99 1.82H9.83a2 2 0 0 1-1.99-1.82l-.35-3.83m.01 0a5.002 5.002 0 0 1 9.01 0" />
            </svg>
        ),
    },
    {
        href: "/discover",
        label: "Explorer les boutiques",
        icon: (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
        ),
    },
    {
        href: "/dashboard/settings",
        label: "Réglages",
        icon: (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
        ),
    },
    {
        href: "/mentions-legales",
        label: "Mentions légales",
        icon: (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6" />
            </svg>
        ),
    },
];

const externalItems = [
    {
        href: "mailto:contact@twostep.fr",
        label: "Support",
        icon: (
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
        ),
    },
];

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function BottomSheetMore({ open, onOpenChange }: Props) {
    const pathname = usePathname();

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/30" />
                <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-2xl bg-white safe-bottom">
                    <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-300" />
                    <div className="p-4 pb-6">
                        {moreItems.map((item) => {
                            const isActive = pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => onOpenChange(false)}
                                    className={`flex items-center gap-3 rounded-xl px-4 py-3.5 no-underline transition ${
                                        isActive ? "bg-[#EEF1FF] text-[#4268FF]" : "text-[#1A1F36] hover:bg-gray-50"
                                    }`}
                                >
                                    {item.icon}
                                    <span className="text-sm font-medium">{item.label}</span>
                                </Link>
                            );
                        })}

                        <div className="my-2 border-t border-gray-100" />

                        {externalItems.map((item) => (
                            <a
                                key={item.href}
                                href={item.href}
                                onClick={() => onOpenChange(false)}
                                className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-[#1A1F36] no-underline transition hover:bg-gray-50"
                            >
                                {item.icon}
                                <span className="text-sm font-medium">{item.label}</span>
                            </a>
                        ))}

                        <div className="my-2 border-t border-gray-100" />

                        <button
                            type="button"
                            onClick={() => { onOpenChange(false); window.location.href = "/auth/logout"; }}
                            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[#c4553a] transition hover:bg-red-50"
                        >
                            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            <span className="text-sm font-medium">Déconnexion</span>
                        </button>
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}

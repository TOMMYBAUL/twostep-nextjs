"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "vaul";

const moreItems = [
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
                                        isActive ? "bg-[#F5F1EB] text-[#D4A574]" : "text-[#2C1A0E] hover:bg-gray-50"
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
                                className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-[#2C1A0E] no-underline transition hover:bg-gray-50"
                            >
                                {item.icon}
                                <span className="text-sm font-medium">{item.label}</span>
                            </a>
                        ))}

                        <div className="my-2 border-t border-gray-100" />

                        <button
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

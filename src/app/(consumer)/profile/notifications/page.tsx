"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Bell01, Heart, ShoppingBag01, Tag01 } from "@untitledui/icons";
import { useRouter } from "next/navigation";
import { subscribePush, unsubscribePush, isPushSubscribed } from "@/lib/push";

type NotifSetting = {
    id: string;
    icon: React.ReactNode;
    iconBg: string;
    label: string;
    description: string;
    enabled: boolean;
};

const STORAGE_KEY = "ts-notif-prefs";

const DEFAULT_PREFS: Record<string, boolean> = {
    promos: true,
    restock: true,
    shops: false,
    push: false,
};

export default function NotificationsPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [prefs, setPrefs] = useState<Record<string, boolean>>(DEFAULT_PREFS);

    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
            setPrefs((prev) => ({ ...prev, ...saved }));
        } catch { /* ignore */ }
        setMounted(true);
    }, []);

    // Check actual push subscription state on mount
    useEffect(() => {
        isPushSubscribed().then((subscribed) => {
            if (subscribed !== prefs.push) {
                setPrefs((prev) => ({ ...prev, push: subscribed }));
            }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = async (id: string) => {
        if (id === "push") {
            try {
                if (prefs.push) {
                    await unsubscribePush();
                    const updated = { ...prefs, push: false };
                    setPrefs(updated);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                } else {
                    const sub = await subscribePush();
                    const updated = { ...prefs, push: !!sub };
                    setPrefs(updated);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                }
            } catch {
                // Permission denied or error — keep current state
            }
            return;
        }
        const updated = { ...prefs, [id]: !prefs[id] };
        setPrefs(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    };

    const settings: NotifSetting[] = [
        {
            id: "push",
            icon: <Bell01 className="size-5" />,
            iconBg: "bg-[#C17B2F]/15 text-[#C17B2F]",
            label: "Notifications push",
            description: "Recevoir des notifications sur ton téléphone",
            enabled: prefs.push,
        },
        {
            id: "promos",
            icon: <Tag01 className="size-5" />,
            iconBg: "bg-[#C17B2F]/15 text-[#C17B2F]",
            label: "Nouvelles promos",
            description: "Quand une boutique suivie lance une promo",
            enabled: prefs.promos,
        },
        {
            id: "restock",
            icon: <Heart className="size-5" />,
            iconBg: "bg-[var(--ts-red)]/15 text-[var(--ts-red)]",
            label: "Réassort d'un favori",
            description: "Quand un produit liké revient en stock",
            enabled: prefs.restock,
        },
        {
            id: "shops",
            icon: <ShoppingBag01 className="size-5" />,
            iconBg: "bg-[var(--ts-sage)]/15 text-[var(--ts-sage)]",
            label: "Actualités boutiques",
            description: "Nouveautés et événements des boutiques suivies",
            enabled: prefs.shops,
        },
    ];

    return (
        <div className="min-h-dvh bg-[#2C1A0E]">
            {/* Header */}
            <div className="bg-[#2C1A0E] px-4 pb-4 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="flex size-10 items-center justify-center rounded-xl bg-[#3D2A1A] transition active:bg-[#2C1A0E]/50"
                        aria-label="Retour"
                    >
                        <ArrowLeft className="size-5 text-[#F5EDD8]/60" />
                    </button>
                    <h1 className="font-display text-lg font-bold text-[#F5EDD8]">Notifications</h1>
                </div>
            </div>

            {/* Settings */}
            <div className="space-y-3 p-4 pb-24">
                {settings.map((setting) => (
                    <div key={setting.id} className="flex items-center gap-3 rounded-2xl bg-[#3D2A1A] p-4">
                        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${setting.iconBg}`}>
                            {setting.icon}
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-[#F5EDD8]">{setting.label}</p>
                            <p className="text-[11px] text-[#F5EDD8]/50">{setting.description}</p>
                        </div>
                        {/* Toggle — rendered client-only to avoid hydration mismatch with localStorage */}
                        {mounted ? (
                            <button
                                type="button"
                                role="switch"
                                aria-checked={setting.enabled}
                                onClick={() => toggle(setting.id)}
                                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
                                    setting.enabled ? "bg-[var(--ts-sage)]" : "bg-[#2C1A0E]"
                                }`}
                            >
                                <span
                                    className="absolute top-0.5 size-6 rounded-full bg-white shadow-md transition-all duration-200"
                                    style={{ left: setting.enabled ? "22px" : "2px" }}
                                />
                            </button>
                        ) : (
                            <div className="h-7 w-12 shrink-0 rounded-full bg-[#2C1A0E]" />
                        )}
                    </div>
                ))}

                <p className="pt-4 text-center text-[11px] text-[#F5EDD8]/30">
                    Les notifications push nécessitent l&apos;autorisation de ton navigateur.
                </p>
            </div>
        </div>
    );
}

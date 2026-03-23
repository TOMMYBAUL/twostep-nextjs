"use client";

import { useState } from "react";
import { User01, LogOut01, ChevronRight, Settings01, NavigationPointer01 } from "@untitledui/icons";
import Link from "next/link";
import { useFavorites } from "../hooks/use-favorites";
import { useFollows } from "../hooks/use-follows";
import { cx } from "@/utils/cx";

const RADIUS_OPTIONS = [1, 3, 5, 10, 15, 25];

export default function ProfilePage() {
    const { data: favorites } = useFavorites();
    const { data: follows } = useFollows();
    const [radius, setRadius] = useState(5);

    return (
        <div className="min-h-dvh bg-[var(--ts-cream)]">
            {/* Header */}
            <div className="bg-white px-4 pb-6 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="flex flex-col items-center gap-3 py-4">
                    <div className="flex size-20 items-center justify-center rounded-full bg-[var(--ts-cream)] shadow-sm">
                        <User01 className="size-8 text-[var(--ts-brown-mid)]/30" />
                    </div>
                    <div className="text-center">
                        <p className="font-display text-lg font-bold text-[var(--ts-brown)]">Mon profil</p>
                        <p className="mt-0.5 text-xs text-[var(--ts-brown-mid)]/50">
                            {favorites?.length ?? 0} favori{(favorites?.length ?? 0) > 1 ? "s" : ""} · {follows?.length ?? 0} boutique{(follows?.length ?? 0) > 1 ? "s" : ""} suivie{(follows?.length ?? 0) > 1 ? "s" : ""}
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-3 p-4 pb-24">
                {/* Search radius */}
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--ts-ochre)]/10">
                            <NavigationPointer01 className="size-5 text-[var(--ts-ochre)]" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-sm font-semibold text-[var(--ts-brown)]">Rayon de recherche</h2>
                            <p className="text-[11px] text-[var(--ts-brown-mid)]/50">Résultats dans un rayon de {radius} km</p>
                        </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                        {RADIUS_OPTIONS.map((r) => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => setRadius(r)}
                                className={cx(
                                    "flex-1 rounded-xl py-2 text-xs font-semibold transition duration-150",
                                    radius === r
                                        ? "bg-[var(--ts-ochre)] text-white shadow-sm"
                                        : "bg-[var(--ts-cream)] text-[var(--ts-brown-mid)]",
                                )}
                            >
                                {r} km
                            </button>
                        ))}
                    </div>
                </div>

                {/* Notifications */}
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--ts-sage)]/15">
                            <Settings01 className="size-5 text-[var(--ts-sage)]" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-sm font-semibold text-[var(--ts-brown)]">Notifications</h2>
                            <p className="text-[11px] text-[var(--ts-brown-mid)]/50">Promos et nouveautés de tes boutiques</p>
                        </div>
                        <ChevronRight className="size-4 text-[var(--ts-brown-mid)]/20" />
                    </div>
                </div>

                {/* Account */}
                <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                    <Link
                        href="/auth/login"
                        className="flex items-center gap-3 p-4 transition duration-150 active:bg-[var(--ts-cream)]/50"
                    >
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--ts-cream)]">
                            <User01 className="size-5 text-[var(--ts-brown-mid)]/50" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-sm font-semibold text-[var(--ts-brown)]">Compte</h2>
                            <p className="text-[11px] text-[var(--ts-brown-mid)]/50">Connexion et paramètres</p>
                        </div>
                        <ChevronRight className="size-4 text-[var(--ts-brown-mid)]/20" />
                    </Link>
                    <div className="border-t border-[var(--ts-cream)]" />
                    <Link
                        href="/auth/logout"
                        className="flex items-center gap-3 p-4 transition duration-150 active:bg-[var(--ts-cream)]/50"
                    >
                        <div className="flex size-10 items-center justify-center rounded-xl bg-red-50">
                            <LogOut01 className="size-5 text-[var(--ts-red)]" />
                        </div>
                        <span className="text-sm font-medium text-[var(--ts-red)]">Déconnexion</span>
                    </Link>
                </div>

                {/* Footer */}
                <p className="pt-4 text-center text-[11px] text-[var(--ts-brown-mid)]/30">
                    Two-Step · Le stock de ton quartier
                </p>
            </div>
        </div>
    );
}

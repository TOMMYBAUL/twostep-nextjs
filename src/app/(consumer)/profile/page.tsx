"use client";

import { User01, LogOut01, ChevronRight, Settings01 } from "@untitledui/icons";
import Link from "next/link";
import { useFavorites } from "../hooks/use-favorites";
import { useFollows } from "../hooks/use-follows";
export default function ProfilePage() {
    const { data: favorites } = useFavorites();
    const { data: follows } = useFollows();

    return (
        <div className="min-h-dvh bg-[#2C1A0E]">
            {/* Header */}
            <div className="bg-[#2C1A0E] px-4 pb-6 pt-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
                <div className="flex flex-col items-center gap-3 py-4">
                    <div className="flex size-20 items-center justify-center rounded-full bg-[#3D2A1A]">
                        <User01 className="size-8 text-[#F5EDD8]/30" />
                    </div>
                    <div className="text-center">
                        <p className="font-display text-lg font-bold text-[#F5EDD8]">Mon profil</p>
                        <p className="mt-0.5 text-xs text-[#F5EDD8]/50">
                            {favorites?.length ?? 0} favori{(favorites?.length ?? 0) > 1 ? "s" : ""} · {follows?.length ?? 0} boutique{(follows?.length ?? 0) > 1 ? "s" : ""} suivie{(follows?.length ?? 0) > 1 ? "s" : ""}
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-3 p-4 pb-24">
                {/* Notifications */}
                <div className="rounded-2xl bg-[#3D2A1A] p-4">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--ts-sage)]/15">
                            <Settings01 className="size-5 text-[var(--ts-sage)]" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-sm font-semibold text-[#F5EDD8]">Notifications</h2>
                            <p className="text-[11px] text-[#F5EDD8]/50">Promos et nouveautés de tes boutiques</p>
                        </div>
                        <ChevronRight className="size-4 text-[#F5EDD8]/20" />
                    </div>
                </div>

                {/* Account */}
                <div className="overflow-hidden rounded-2xl bg-[#3D2A1A]">
                    <Link
                        href="/auth/login"
                        className="flex items-center gap-3 p-4 transition duration-150 active:bg-[#2C1A0E]/50"
                    >
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[#2C1A0E]">
                            <User01 className="size-5 text-[#F5EDD8]/50" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-sm font-semibold text-[#F5EDD8]">Compte</h2>
                            <p className="text-[11px] text-[#F5EDD8]/50">Connexion et paramètres</p>
                        </div>
                        <ChevronRight className="size-4 text-[#F5EDD8]/20" />
                    </Link>
                    <div className="border-t border-[#2C1A0E]" />
                    <Link
                        href="/auth/logout"
                        className="flex items-center gap-3 p-4 transition duration-150 active:bg-[#2C1A0E]/50"
                    >
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--ts-red)]/10">
                            <LogOut01 className="size-5 text-[var(--ts-red)]" />
                        </div>
                        <span className="text-sm font-medium text-[var(--ts-red)]">Déconnexion</span>
                    </Link>
                </div>

                {/* Footer */}
                <p className="pt-4 text-center text-[11px] text-[#F5EDD8]/30">
                    Two-Step · Le stock de ton quartier
                </p>
            </div>
        </div>
    );
}

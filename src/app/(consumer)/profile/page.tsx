"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { User01, LogOut01, ChevronRight, Settings01, Heart, MarkerPin01, Share07, Bell01, Copy06, XClose, Link03, Ruler, Edit05 } from "@untitledui/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cx } from "@/utils/cx";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { useFavorites } from "../hooks/use-favorites";
import { useFollows, useToggleFollow } from "../hooks/use-follows";
import { generateSlug } from "@/lib/slug";

const INVITE_URL = "https://www.twostep.fr";

export default function ProfilePage() {
    const { data: favorites } = useFavorites();
    const { data: follows } = useFollows();
    const [user, setUser] = useState<{ email?: string } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            setUser(data.user ? { email: data.user.email } : null);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.reload();
    };

    const [shareOpen, setShareOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

    const handleCopy = async () => {
        await navigator.clipboard.writeText(INVITE_URL);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleNativeShare = async () => {
        try {
            await navigator.share({ title: "Two-Step", text: "Découvre les boutiques de ton quartier avec Two-Step", url: INVITE_URL });
        } catch { /* user cancelled */ }
        setShareOpen(false);
    };

    const { unfollow } = useToggleFollow();
    const [followsOpen, setFollowsOpen] = useState(false);

    const favCount = favorites?.length ?? 0;
    const followCount = follows?.length ?? 0;
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load avatar from preferences API
    useEffect(() => {
        if (!user) return;
        fetch("/api/consumer/preferences").then(r => r.ok ? r.json() : null).then(d => {
            if (d?.avatar_url) setAvatarUrl(d.avatar_url);
        });
    }, [user]);

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const supabase = createClient();
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) return;

        const path = `${u.id}/avatar.jpg`;
        const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
        if (error) return;

        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        const publicUrl = data.publicUrl + `?t=${Date.now()}`; // cache bust

        await supabase.from("consumer_profiles").upsert({ user_id: u.id, avatar_url: publicUrl }, { onConflict: "user_id" });
        setAvatarUrl(publicUrl);
    };

    return (
        <div className="min-h-dvh bg-[#1C1209]">
            {/* ── Header profil ── */}
            <div
                className="bg-gradient-to-b from-[#2a1a08] to-[#1C1209] px-5 pb-5 pt-4"
                style={{ paddingTop: "calc(env(safe-area-inset-top) + 20px)" }}
            >
                {loading ? (
                    <div className="flex items-center gap-3.5 py-2">
                        <div className="size-14 animate-pulse rounded-full bg-[#3d2008]" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-28 animate-pulse rounded bg-[#3d2008]" />
                            <div className="h-3 w-40 animate-pulse rounded bg-[#3d2008]" />
                        </div>
                    </div>
                ) : user ? (
                    <div className="flex items-center gap-3.5">
                        {/* Avatar with edit button */}
                        <div className="relative shrink-0">
                            <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border-2 border-[#6b3a10] bg-[#3d2008]">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <User01 className="size-7 text-[#f0c080]" />
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute -bottom-0.5 -right-0.5 flex size-[22px] items-center justify-center rounded-full border-2 border-[#130e07] bg-[#c87830]"
                            >
                                <Edit05 className="size-2.5 text-[#130e07]" />
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-medium text-[#f5deb3]">{user.email}</p>
                            <p className="mt-0.5 text-xs text-[#a07840]">
                                {favCount} favori{favCount > 1 ? "s" : ""} · {followCount} boutique{followCount > 1 ? "s" : ""} suivie{followCount > 1 ? "s" : ""}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3.5">
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-[#6b3a10] bg-[#3d2008]">
                            <User01 className="size-6 text-[#f0c080]" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-medium text-[#f5deb3]">Mon profil</p>
                            <p className="mt-0.5 text-xs text-[#a07840]">Connecte-toi pour accéder à tout</p>
                        </div>
                        <Link
                            href="/auth/login"
                            className="shrink-0 rounded-full bg-[#6b3a10] px-3.5 py-[7px] text-xs font-semibold text-[#f5deb3] transition duration-100 active:opacity-80"
                        >
                            Connexion
                        </Link>
                    </div>
                )}
            </div>

            {/* ── Stats row — 3 cards ── */}
            <div className="flex gap-2 px-4 pb-4">
                <Link href="/favorites" className="flex flex-1 flex-col items-center rounded-xl border-[0.5px] border-[#3d2a10] bg-[#2a1a08] py-2.5 transition active:bg-[#3d2008]">
                    <Heart className="mb-1 size-4 text-[#c87830]" />
                    <p className="text-xl font-medium text-[#f0c080]">{favCount}</p>
                    <p className="text-[10px] text-[#a07840]">Favoris</p>
                </Link>
                <button
                    type="button"
                    onClick={() => setFollowsOpen(true)}
                    className="flex flex-1 flex-col items-center rounded-xl border-[0.5px] border-[#3d2a10] bg-[#2a1a08] py-2.5 transition active:bg-[#3d2008]"
                >
                    <MarkerPin01 className="mb-1 size-4 text-[#c87830]" />
                    <p className="text-xl font-medium text-[#f0c080]">{followCount}</p>
                    <p className="text-[10px] text-[#a07840]">Boutiques</p>
                </button>
            </div>

            {/* ── Mes tailles ── */}
            {user && <SizingPreferences />}

            {/* ── Section label ── */}
            <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-[1px] text-[#a07840]">
                Mon compte
            </p>

            {/* ── Menu items ── */}
            <div className="mx-4 overflow-hidden rounded-xl border-[0.5px] border-[#3d2a10] bg-[#2a1a08]">
                {/* Notifications */}
                <Link href="/profile/notifications" className="flex items-center gap-3 px-4 py-3 transition duration-100 active:bg-[#3d2008]">
                    <div className="flex size-9 items-center justify-center rounded-[10px] bg-[#1C1209]">
                        <Bell01 className="size-[18px] text-[#c87830]" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[#f5deb3]">Notifications</p>
                        <p className="text-[11px] text-[#a07840]">Promos et nouveautés de tes boutiques</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#6b3a10] px-2.5 py-[3px] text-[11px] font-semibold text-[#f0c080]">
                        Activer
                    </span>
                </Link>

                <div className="mx-4 border-t-[0.5px] border-[#3d2a10]" />

                {/* Invite friends */}
                <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="flex w-full items-center gap-3 px-4 py-3 transition duration-100 active:bg-[#3d2008]"
                >
                    <div className="flex size-9 items-center justify-center rounded-[10px] bg-[#1C1209]">
                        <Share07 className="size-[18px] text-[#c87830]" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                        <p className="text-[13px] font-medium text-[#f5deb3]">Inviter des amis</p>
                        <p className="text-[11px] text-[#a07840]">Fais découvrir les boutiques de ton quartier</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-[#5a3a18]" />
                </button>

                {user && (
                    <>
                        <div className="mx-4 border-t-[0.5px] border-[#3d2a10]" />
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex w-full items-center gap-3 px-4 py-3 transition duration-100 active:bg-[#3d2008]"
                        >
                            <div className="flex size-9 items-center justify-center rounded-[10px] bg-[#1C1209]">
                                <LogOut01 className="size-[18px] text-[#c87830]" />
                            </div>
                            <span className="text-[13px] font-medium text-[#f5deb3]">Déconnexion</span>
                        </button>
                    </>
                )}
            </div>

            {/* ── Pourquoi acheter local ? ── */}
            <div className="mx-4 mt-4 overflow-hidden rounded-[14px] border-[0.5px] border-[#3d2a10] bg-[#2a1a08] p-3.5">
                <div className="mb-3 flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-[#3d2008]">
                        <span className="text-sm">💡</span>
                    </div>
                    <h2 className="text-[13px] font-medium text-[#c87830]">Pourquoi acheter local ?</h2>
                </div>

                <div className="flex items-start gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#3d2008]">
                        <span className="text-sm">💚</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-medium text-[#f5deb3]">Ton achat fait vivre un voisin</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-[#a07840]">Pour 100€ dépensés en boutique, 73€ restent dans l'économie locale. Sur internet, c'est moins de 15€.</p>
                    </div>
                </div>

                <div className="my-2.5 border-t-[0.5px] border-[#3d2a10]" />

                <div className="flex items-start gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#3d2008]">
                        <span className="text-sm">🌍</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-medium text-[#f5deb3]">Zéro colis, zéro carton</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-[#a07840]">Pas d'emballage, pas de camion de livraison. Tu repars avec ton achat sous le bras.</p>
                    </div>
                </div>

                <div className="my-2.5 border-t-[0.5px] border-[#3d2a10]" />

                <div className="flex items-start gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#3d2008]">
                        <span className="text-sm">🛍️</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-medium text-[#f5deb3]">Des rues vivantes, pas des vitrines vides</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-[#a07840]">Chaque achat local aide à garder ton quartier animé et tes commerçants ouverts.</p>
                    </div>
                </div>
            </div>

            {/* ── Footer links ── */}
            <div className="flex items-center justify-center gap-4 pb-24 pt-6">
                <Link href="/mentions-legales" className="text-[11px] text-[#a07840]/50 transition active:text-[#a07840]">
                    Mentions légales
                </Link>
                <span className="text-[#a07840]/20">·</span>
                <a href="mailto:contact@twostep.fr" className="text-[11px] text-[#a07840]/50 transition active:text-[#a07840]">
                    Contact
                </a>
                <span className="text-[#a07840]/20">·</span>
                <span className="text-[11px] text-[#a07840]/30">Two-Step</span>
            </div>

            {/* ── Bottom sheet: Mes boutiques suivies ── */}
            <AnimatePresence>
                {followsOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] bg-black/60"
                            onClick={() => setFollowsOpen(false)}
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 340 }}
                            className="fixed bottom-0 left-0 right-0 z-[61] max-h-[70vh] overflow-y-auto rounded-t-2xl bg-[#1C1209] px-5 pb-8 pt-4"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)" }}
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-[15px] font-semibold text-[#f5deb3]">Boutiques suivies</h3>
                                <button type="button" onClick={() => setFollowsOpen(false)} className="rounded-full bg-[#2a1a08] p-1.5">
                                    <XClose className="size-4 text-[#a07840]" />
                                </button>
                            </div>

                            {!follows || follows.length === 0 ? (
                                <p className="py-6 text-center text-[13px] text-[#5a4020]">
                                    Tu ne suis aucune boutique pour le moment.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {follows.map((f: any) => {
                                        const merchant = f.merchants;
                                        if (!merchant) return null;
                                        return (
                                            <div key={f.merchant_id} className="flex items-center gap-3 rounded-xl bg-[#2a1a08] p-3">
                                                <Link
                                                    href={`/shop/${generateSlug(merchant.name || "", f.merchant_id)}`}
                                                    onClick={() => setFollowsOpen(false)}
                                                    className="flex flex-1 items-center gap-3 min-w-0"
                                                >
                                                    <div className="size-11 shrink-0 overflow-hidden rounded-full bg-[#1C1209] border border-[#3d2a10]">
                                                        {merchant.photo_url ? (
                                                            <img src={merchant.photo_url} alt={merchant.name} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full items-center justify-center text-sm font-bold text-[#c87830]">
                                                                {merchant.name?.charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-[13px] font-medium text-[#f5deb3]">{merchant.name}</p>
                                                        {merchant.city && (
                                                            <p className="text-[11px] text-[#5a4020]">{merchant.city}</p>
                                                        )}
                                                    </div>
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => unfollow.mutate(f.merchant_id)}
                                                    className="shrink-0 rounded-lg border border-[#3d2a10] px-3 py-1.5 text-xs font-semibold text-[#a07840] transition active:bg-[#3d2008]"
                                                >
                                                    Abonné ✓
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ── Bottom sheet: Inviter des amis ── */}
            <AnimatePresence>
                {shareOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] bg-black/60"
                            onClick={() => setShareOpen(false)}
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 340 }}
                            className="fixed bottom-0 left-0 right-0 z-[61] rounded-t-2xl bg-[#1C1209] px-5 pb-8 pt-4"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)" }}
                        >
                            {/* Handle + close */}
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-[15px] font-semibold text-[#f5deb3]">Inviter des amis</h3>
                                <button type="button" onClick={() => setShareOpen(false)} className="rounded-full bg-[#2a1a08] p-1.5">
                                    <XClose className="size-4 text-[#a07840]" />
                                </button>
                            </div>

                            {/* URL field */}
                            <div className="flex items-center gap-2 rounded-xl border-[0.5px] border-[#3d2a10] bg-[#2a1a08] px-3 py-2.5">
                                <Link03 className="size-4 shrink-0 text-[#a07840]" />
                                <span className="flex-1 truncate text-[13px] text-[#f5deb3]/70">{INVITE_URL}</span>
                            </div>

                            {/* Buttons */}
                            <div className="mt-4 flex flex-col gap-2.5">
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2a1a08] py-3 text-[13px] font-medium text-[#f5deb3] transition active:bg-[#3d2008]"
                                >
                                    <Copy06 className="size-4" />
                                    {copied ? "Lien copié !" : "Copier le lien"}
                                </button>

                                {canNativeShare && (
                                    <button
                                        type="button"
                                        onClick={handleNativeShare}
                                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c87830] py-3 text-[13px] font-semibold text-[#130e07] transition active:opacity-80"
                                    >
                                        <Share07 className="size-4" />
                                        Envoyer via...
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── Sizing preferences component ── */
const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
const SHOE_SIZES = [35, 35.5, 36, 36.5, 37, 37.5, 38, 38.5, 39, 39.5, 40, 40.5, 41, 41.5, 42, 42.5, 43, 43.5, 44, 44.5, 45, 45.5, 46, 46.5, 47] as const;

function SizingPreferences() {
    const { data } = useQuery({
        queryKey: ["sizing-prefs"],
        queryFn: async () => {
            const res = await fetch("/api/consumer/preferences");
            if (!res.ok) return { clothing_size: null, shoe_size: null };
            return res.json();
        },
    });

    const [clothing, setClothing] = useState<string | null>(null);
    const [shoe, setShoe] = useState<number | null>(null);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (data) {
            setClothing(data.clothing_size);
            setShoe(data.shoe_size);
        }
    }, [data]);

    const save = async () => {
        await fetch("/api/consumer/preferences", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clothing_size: clothing, shoe_size: shoe }),
        });
        setDirty(false);
    };

    const selectStyle = "appearance-none rounded-lg border-[0.5px] border-[#3d2a10] bg-[#2a1a08] px-3 py-[7px] pr-8 font-[inherit] text-[13px] cursor-pointer min-w-[110px] bg-[length:12px_12px] bg-[position:right_10px_center] bg-no-repeat";
    const chevronBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a07840' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`;

    return (
        <div className="mx-4 mb-4 rounded-xl border-[0.5px] border-[#3d2a10] bg-[#2a1a08] p-3.5">
            <div className="mb-3 flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-[#1C1209]">
                    <Ruler className="size-3.5 text-[#c87830]" />
                </div>
                <p className="text-[13px] font-medium text-[#f5deb3]">Mes tailles</p>
            </div>

            {/* Vêtements */}
            <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] text-[#e8d4b0]">Vêtements</span>
                <select
                    value={clothing ?? ""}
                    onChange={(e) => { setClothing(e.target.value || null); setDirty(true); }}
                    className={selectStyle}
                    style={{ backgroundImage: chevronBg, color: clothing ? "#f0dfc0" : "#5a4020" }}
                >
                    <option value="">Choisir</option>
                    {CLOTHING_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </div>

            {/* Pointure */}
            <div className="mb-4 flex items-center justify-between">
                <span className="text-[13px] text-[#e8d4b0]">Pointure</span>
                <select
                    value={shoe ?? ""}
                    onChange={(e) => { setShoe(e.target.value ? Number(e.target.value) : null); setDirty(true); }}
                    className={selectStyle}
                    style={{ backgroundImage: chevronBg, color: shoe ? "#f0dfc0" : "#5a4020" }}
                >
                    <option value="">Choisir</option>
                    {SHOE_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </div>

            {dirty && (
                <button
                    type="button"
                    onClick={save}
                    className="w-full rounded-xl bg-[#c87830] py-3 text-[14px] font-semibold text-[#130e07] transition active:opacity-80"
                >
                    Enregistrer
                </button>
            )}
        </div>
    );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { User01, LogOut01, ChevronRight, Settings01, Heart, MarkerPin01, Share07, Bell01, Copy06, XClose, Link03, Ruler, Edit05, Check } from "@untitledui/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cx } from "@/utils/cx";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { useFavorites } from "../hooks/use-favorites";
import { useFocusTrap } from "../hooks/use-focus-trap";
import { useFollows, useToggleFollow } from "../hooks/use-follows";
import { generateSlug } from "@/lib/slug";

const INVITE_URL = "https://www.twostep.fr";

const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none";

export default function ProfilePage() {
    const { data: favorites } = useFavorites();
    const { data: follows } = useFollows();
    const [user, setUser] = useState<{ email?: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMerchant, setIsMerchant] = useState(false);
    const prefersReducedMotion = useReducedMotion();

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(async ({ data }) => {
            setUser(data.user ? { email: data.user.email } : null);
            if (data.user) {
                const { data: merchant } = await supabase
                    .from("merchants")
                    .select("id")
                    .eq("user_id", data.user.id)
                    .maybeSingle();
                setIsMerchant(!!merchant);
            }
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
        try { await navigator.clipboard.writeText(INVITE_URL); } catch {}
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

    const [avatarError, setAvatarError] = useState<string | null>(null);

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) { setAvatarError("Format non supporté"); return; }
        if (file.size > 5 * 1024 * 1024) { setAvatarError("Photo trop lourde (max 5 Mo)"); return; }
        setAvatarError(null);

        try {
            const supabase = createClient();
            const { data: { user: u } } = await supabase.auth.getUser();
            if (!u) { setAvatarError("Non connecté"); return; }

            const path = `${u.id}/avatar.jpg`;
            const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
            if (error) { setAvatarError(`Échec upload : ${error.message}`); return; }

            const { data } = supabase.storage.from("avatars").getPublicUrl(path);
            const publicUrl = data.publicUrl + `?t=${Date.now()}`;

            await supabase.from("consumer_profiles").upsert({ user_id: u.id, avatar_url: publicUrl }, { onConflict: "user_id" });
            setAvatarUrl(publicUrl);
        } catch {
            setAvatarError("Erreur inattendue");
        }
    };

    // Focus trapping for bottom sheets
    const followsSheetRef = useFocusTrap(followsOpen);
    const shareSheetRef = useFocusTrap(shareOpen);

    // Escape key handler for bottom sheets
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (followsOpen) setFollowsOpen(false);
                if (shareOpen) setShareOpen(false);
            }
        };
        if (followsOpen || shareOpen) {
            document.addEventListener("keydown", handleKeyDown);
            return () => document.removeEventListener("keydown", handleKeyDown);
        }
    }, [followsOpen, shareOpen]);

    return (
        <div className="min-h-dvh bg-secondary">
            {/* ── Header profil ── */}
            <div
                className="bg-gradient-to-b from-secondary to-secondary px-5 pb-5 pt-4"
                style={{ paddingTop: "calc(env(safe-area-inset-top) + 20px)" }}
            >
                {loading ? (
                    <div className="flex items-center gap-3.5 py-2">
                        <div className="size-14 animate-pulse rounded-full bg-secondary_hover" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-28 animate-pulse rounded bg-secondary_hover" />
                            <div className="h-3 w-40 animate-pulse rounded bg-secondary_hover" />
                        </div>
                    </div>
                ) : user ? (
                    <div className="flex items-center gap-3.5">
                        {/* Avatar with edit button */}
                        <div className="relative shrink-0">
                            <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border-2 border-secondary bg-secondary_hover">
                                {avatarUrl ? (
                                    <Image src={avatarUrl} alt="Photo de profil" width={64} height={64} className="h-full w-full object-cover" />
                                ) : (
                                    <User01 className="size-7 text-primary" aria-hidden="true" />
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                aria-label="Modifier la photo de profil"
                                className={cx(
                                    "absolute -bottom-0.5 -right-0.5 flex size-[22px] items-center justify-center rounded-full border-2 border-white bg-brand-solid",
                                    FOCUS_RING
                                )}
                            >
                                <Edit05 className="size-2.5 text-white" aria-hidden="true" />
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-medium text-primary">{user.email}</p>
                            {avatarError && <p className="mt-0.5 text-[11px] text-error-primary">{avatarError}</p>}
                            <p className="mt-0.5 text-xs text-tertiary">
                                {favCount} favori{favCount > 1 ? "s" : ""} · {followCount} boutique{followCount > 1 ? "s" : ""} suivie{followCount > 1 ? "s" : ""}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3.5">
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-secondary bg-secondary_hover">
                            <User01 className="size-6 text-primary" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-medium text-primary">Mon profil</p>
                            <p className="mt-0.5 text-xs text-tertiary">Connecte-toi pour accéder à tout</p>
                        </div>
                        <Link
                            href="/auth/login"
                            className={cx(
                                "shrink-0 rounded-full bg-secondary_hover px-3.5 py-[7px] text-xs font-semibold text-primary transition duration-100 active:opacity-80 motion-reduce:transform-none min-h-[44px] flex items-center",
                                FOCUS_RING
                            )}
                        >
                            Connexion
                        </Link>
                    </div>
                )}
            </div>

            {/* ── Stats row — 3 cards ── */}
            <div className="flex gap-2 px-4 pb-4">
                <Link
                    href="/favorites"
                    className={cx(
                        "flex flex-1 flex-col items-center rounded-xl border-[0.5px] border-secondary bg-secondary py-2.5 transition active:bg-secondary_hover motion-reduce:transform-none min-h-[44px]",
                        FOCUS_RING
                    )}
                >
                    <Heart className="mb-1 size-4 text-brand-secondary" aria-hidden="true" />
                    <p className="text-xl font-medium text-primary">{favCount}</p>
                    <p className="text-[10px] text-tertiary">Favoris</p>
                </Link>
                <button
                    type="button"
                    onClick={() => setFollowsOpen(true)}
                    className={cx(
                        "flex flex-1 flex-col items-center rounded-xl border-[0.5px] border-secondary bg-secondary py-2.5 transition active:bg-secondary_hover motion-reduce:transform-none min-h-[44px]",
                        FOCUS_RING
                    )}
                >
                    <MarkerPin01 className="mb-1 size-4 text-brand-secondary" aria-hidden="true" />
                    <p className="text-xl font-medium text-primary">{followCount}</p>
                    <p className="text-[10px] text-tertiary">Boutiques</p>
                </button>
            </div>

            {/* ── Mes tailles ── */}
            {user && <SizingPreferences />}

            {/* ── Section label ── */}
            <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-[1px] text-tertiary">
                Mon compte
            </p>

            {/* ── Menu items ── */}
            <div className="mx-4 overflow-hidden rounded-xl border-[0.5px] border-secondary bg-secondary">
                {/* Notifications */}
                <Link
                    href="/profile/notifications"
                    className={cx(
                        "flex items-center gap-3 px-4 py-3 transition duration-100 active:bg-secondary_hover motion-reduce:transform-none min-h-[44px]",
                        FOCUS_RING
                    )}
                >
                    <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary">
                        <Bell01 className="size-[18px] text-brand-secondary" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-primary">Notifications</p>
                        <p className="text-[11px] text-tertiary">Promos et nouveautés de tes boutiques</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-secondary_hover px-2.5 py-[3px] text-[11px] font-semibold text-primary">
                        Activer
                    </span>
                </Link>

                <div className="mx-4 border-t-[0.5px] border-secondary" />

                {/* Invite friends */}
                <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className={cx(
                        "flex w-full items-center gap-3 px-4 py-3 transition duration-100 active:bg-secondary_hover motion-reduce:transform-none min-h-[44px]",
                        FOCUS_RING
                    )}
                >
                    <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary">
                        <Share07 className="size-[18px] text-brand-secondary" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                        <p className="text-[13px] font-medium text-primary">Inviter des amis</p>
                        <p className="text-[11px] text-tertiary">Fais découvrir les boutiques de ton quartier</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                </button>

                {user && (
                    <>
                        {isMerchant && (
                            <>
                                <div className="mx-4 border-t-[0.5px] border-secondary" />
                                <Link
                                    href="/dashboard"
                                    className={cx(
                                        "flex items-center gap-3 px-4 py-3 transition duration-100 active:bg-secondary_hover motion-reduce:transform-none min-h-[44px]",
                                        FOCUS_RING
                                    )}
                                >
                                    <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary">
                                        <Settings01 className="size-[18px] text-brand-secondary" aria-hidden="true" />
                                    </div>
                                    <span className="flex-1 text-[13px] font-medium text-primary">Mon dashboard</span>
                                    <ChevronRight className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                                </Link>
                            </>
                        )}
                        <div className="mx-4 border-t-[0.5px] border-secondary" />
                        <button
                            type="button"
                            onClick={handleLogout}
                            className={cx(
                                "flex w-full items-center gap-3 px-4 py-3 transition duration-100 active:bg-secondary_hover motion-reduce:transform-none min-h-[44px]",
                                FOCUS_RING
                            )}
                        >
                            <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary">
                                <LogOut01 className="size-[18px] text-brand-secondary" aria-hidden="true" />
                            </div>
                            <span className="text-[13px] font-medium text-primary">Déconnexion</span>
                        </button>
                    </>
                )}
            </div>

            {/* ── Pourquoi acheter local ? ── */}
            <div className="mx-4 mt-4 overflow-hidden rounded-[14px] border-[0.5px] border-secondary bg-secondary p-3.5">
                <div className="mb-3 flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-secondary_hover">
                        <span className="text-sm">💡</span>
                    </div>
                    <h2 className="text-[13px] font-medium text-brand-secondary">Pourquoi acheter local ?</h2>
                </div>

                <div className="flex items-start gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary_hover">
                        <span className="text-sm">💚</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-medium text-primary">Ton achat fait vivre un voisin</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-tertiary">Pour 100€ dépensés en boutique, 73€ restent dans l'économie locale. Sur internet, c'est moins de 15€.</p>
                    </div>
                </div>

                <div className="my-2.5 border-t-[0.5px] border-secondary" />

                <div className="flex items-start gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary_hover">
                        <span className="text-sm">🌍</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-medium text-primary">Zéro colis, zéro carton</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-tertiary">Pas d'emballage, pas de camion de livraison. Tu repars avec ton achat sous le bras.</p>
                    </div>
                </div>

                <div className="my-2.5 border-t-[0.5px] border-secondary" />

                <div className="flex items-start gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary_hover">
                        <span className="text-sm">🛍️</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-medium text-primary">Des rues vivantes, pas des vitrines vides</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-tertiary">Chaque achat local aide à garder ton quartier animé et tes commerçants ouverts.</p>
                    </div>
                </div>
            </div>

            {/* ── Footer links ── */}
            <div className="flex items-center justify-center gap-4 pb-24 pt-6">
                <Link href="/mentions-legales" className={cx("text-[11px] text-quaternary transition active:text-tertiary", FOCUS_RING)}>
                    Mentions légales
                </Link>
                <span className="text-quaternary" aria-hidden="true">·</span>
                <a href="mailto:contact@twostep.fr" className={cx("text-[11px] text-quaternary transition active:text-tertiary", FOCUS_RING)}>
                    Contact
                </a>
                <span className="text-quaternary" aria-hidden="true">·</span>
                <span className="text-[11px] text-quaternary">Two-Step</span>
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
                            role="button"
                            tabIndex={-1}
                            aria-label="Fermer"
                        />
                        <motion.div
                            ref={followsSheetRef}
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", damping: 28, stiffness: 340 }}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Boutiques suivies"
                            className="fixed bottom-0 left-0 right-0 z-[61] max-h-[70vh] overflow-y-auto overscroll-contain rounded-t-2xl bg-secondary px-5 pb-8 pt-4"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)" }}
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-[15px] font-semibold text-primary">Boutiques suivies</h3>
                                <button
                                    type="button"
                                    onClick={() => setFollowsOpen(false)}
                                    aria-label="Fermer"
                                    className={cx("min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-secondary p-1.5", FOCUS_RING)}
                                >
                                    <XClose className="size-4 text-tertiary" aria-hidden="true" />
                                </button>
                            </div>

                            {!follows || follows.length === 0 ? (
                                <p className="py-6 text-center text-[13px] text-tertiary">
                                    Tu ne suis aucune boutique pour le moment.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {follows.map((f) => {
                                        const merchant = f.merchants;
                                        if (!merchant) return null;
                                        return (
                                            <div key={f.merchant_id} className="flex items-center gap-3 rounded-xl bg-secondary p-3">
                                                <Link
                                                    href={`/shop/${generateSlug(merchant.name || "", f.merchant_id)}`}
                                                    onClick={() => setFollowsOpen(false)}
                                                    className={cx("flex flex-1 items-center gap-3 min-w-0", FOCUS_RING)}
                                                >
                                                    <div className="size-11 shrink-0 overflow-hidden rounded-full bg-primary border border-secondary">
                                                        {merchant.photo_url ? (
                                                            <Image src={merchant.photo_url} alt={merchant.name} width={44} height={44} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full items-center justify-center text-sm font-bold text-brand-secondary">
                                                                {merchant.name?.charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-[13px] font-medium text-primary">{merchant.name}</p>
                                                        {merchant.city && (
                                                            <p className="text-[11px] text-tertiary">{merchant.city}</p>
                                                        )}
                                                    </div>
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => unfollow.mutate(f.merchant_id)}
                                                    className={cx(
                                                        "shrink-0 rounded-lg border border-secondary px-3 py-1.5 text-xs font-semibold text-tertiary transition active:bg-secondary_hover motion-reduce:transform-none min-h-[44px] flex items-center",
                                                        FOCUS_RING
                                                    )}
                                                >
                                                    <Check className="mr-1 inline size-3.5" aria-hidden="true" />
                                                    Abonné
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
                            role="button"
                            tabIndex={-1}
                            aria-label="Fermer"
                        />
                        <motion.div
                            ref={shareSheetRef}
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", damping: 28, stiffness: 340 }}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Inviter des amis"
                            className="fixed bottom-0 left-0 right-0 z-[61] overscroll-contain rounded-t-2xl bg-secondary px-5 pb-8 pt-4"
                            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 32px)" }}
                        >
                            {/* Handle + close */}
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-[15px] font-semibold text-primary">Inviter des amis</h3>
                                <button
                                    type="button"
                                    onClick={() => setShareOpen(false)}
                                    aria-label="Fermer"
                                    className={cx("min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-secondary p-1.5", FOCUS_RING)}
                                >
                                    <XClose className="size-4 text-tertiary" aria-hidden="true" />
                                </button>
                            </div>

                            {/* URL field */}
                            <div className="flex items-center gap-2 rounded-xl border-[0.5px] border-secondary bg-secondary px-3 py-2.5">
                                <Link03 className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                                <span className="flex-1 truncate text-[13px] text-primary/70">{INVITE_URL}</span>
                            </div>

                            {/* Buttons */}
                            <div className="mt-4 flex flex-col gap-2.5">
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className={cx(
                                        "flex w-full items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-[13px] font-medium text-primary transition active:bg-secondary_hover motion-reduce:transform-none min-h-[44px]",
                                        FOCUS_RING
                                    )}
                                >
                                    <Copy06 className="size-4" aria-hidden="true" />
                                    {copied ? "Lien copié !" : "Copier le lien"}
                                </button>

                                {canNativeShare && (
                                    <button
                                        type="button"
                                        onClick={handleNativeShare}
                                        className={cx(
                                            "flex w-full items-center justify-center gap-2 rounded-xl bg-brand-solid py-3 text-[13px] font-semibold text-white transition active:opacity-80 motion-reduce:transform-none min-h-[44px]",
                                            FOCUS_RING
                                        )}
                                    >
                                        <Share07 className="size-4" aria-hidden="true" />
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
const CLOTHING_SIZES = ["2A", "4A", "6A", "8A", "10A", "12A", "14A", "16A", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
const SHOE_SIZES = [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 35.5, 36, 36.5, 37, 37.5, 38, 38.5, 39, 39.5, 40, 40.5, 41, 41.5, 42, 42.5, 43, 43.5, 44, 44.5, 45, 45.5, 46, 46.5, 47, 47.5, 48, 48.5, 49, 49.5, 50] as const;

const FOCUS_RING_INLINE = "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none";

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

    const selectStyle = cx(
        "appearance-none rounded-lg border-[0.5px] border-secondary bg-secondary px-3 py-[7px] pr-8 font-[inherit] text-[13px] cursor-pointer min-w-[110px] bg-[length:12px_12px] bg-[position:right_10px_center] bg-no-repeat",
        FOCUS_RING_INLINE
    );
    const chevronBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234268FF' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`;

    return (
        <div className="mx-4 mb-4 rounded-xl border-[0.5px] border-secondary bg-secondary p-3.5">
            <div className="mb-3 flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
                    <Ruler className="size-3.5 text-brand-secondary" aria-hidden="true" />
                </div>
                <p className="text-[13px] font-medium text-primary">Mes tailles</p>
            </div>

            {/* Vêtements */}
            <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] text-primary">Vêtements</span>
                <select
                    value={clothing ?? ""}
                    onChange={(e) => { setClothing(e.target.value || null); setDirty(true); }}
                    className={cx(selectStyle, clothing ? "text-primary" : "text-placeholder")}
                    style={{ backgroundImage: chevronBg }}
                    aria-label="Taille vêtements"
                >
                    <option value="">Choisir</option>
                    {CLOTHING_SIZES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </div>

            {/* Pointure */}
            <div className="mb-4 flex items-center justify-between">
                <span className="text-[13px] text-primary">Pointure</span>
                <select
                    value={shoe ?? ""}
                    onChange={(e) => { setShoe(e.target.value ? Number(e.target.value) : null); setDirty(true); }}
                    className={cx(selectStyle, shoe ? "text-primary" : "text-placeholder")}
                    style={{ backgroundImage: chevronBg }}
                    aria-label="Pointure chaussures"
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
                    className={cx(
                        "w-full rounded-xl bg-brand-solid py-3 text-[14px] font-semibold text-white transition active:opacity-80 motion-reduce:transform-none min-h-[44px]",
                        FOCUS_RING_INLINE
                    )}
                >
                    Enregistrer
                </button>
            )}
        </div>
    );
}

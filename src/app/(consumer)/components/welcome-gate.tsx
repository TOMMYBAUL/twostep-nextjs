"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MarkerPin01, Heart } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const STORAGE_KEY = "ts-welcome-dismissed";

const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
const SHOE_SIZES = [35, 35.5, 36, 36.5, 37, 37.5, 38, 38.5, 39, 39.5, 40, 40.5, 41, 41.5, 42, 42.5, 43, 43.5, 44, 44.5, 45, 45.5, 46, 46.5, 47] as const;

export function WelcomeGate() {
    const [show, setShow] = useState(false);
    const [mode, setMode] = useState<"welcome" | "signup" | "login" | "sizing">("welcome");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Sizing preferences
    const [clothingSize, setClothingSize] = useState<string | null>(null);
    const [shoeSize, setShoeSize] = useState<number | null>(null);

    useEffect(() => {
        if (localStorage.getItem(STORAGE_KEY)) return;
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            if (!data.user) setShow(true);
        }).catch(() => {
            setShow(true);
        });
    }, []);

    const dismiss = () => {
        localStorage.setItem(STORAGE_KEY, "1");
        setShow(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const supabase = createClient();
            if (mode === "signup") {
                const { error: err } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
                });
                if (err) throw err;
                // After signup, show sizing step
                setLoading(false);
                setMode("sizing");
                return;
            } else {
                const { error: err } = await supabase.auth.signInWithPassword({ email, password });
                if (err) throw err;
            }
            dismiss();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erreur");
        } finally {
            setLoading(false);
        }
    };

    const handleSizingSave = async () => {
        if (clothingSize || shoeSize) {
            try {
                await fetch("/api/consumer/preferences", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        clothing_size: clothingSize,
                        shoe_size: shoeSize,
                    }),
                });
            } catch {
                // Silent fail — preferences are optional
            }
        }
        dismiss();
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/30 backdrop-blur-sm sm:items-center sm:justify-center">
            <div className="w-full rounded-t-3xl bg-white px-6 pb-8 pt-2 shadow-2xl sm:max-w-sm sm:rounded-3xl">
                {/* Drag indicator */}
                <div className="mb-4 flex justify-center">
                    <div className="h-1 w-10 rounded-full bg-gray-200" />
                </div>

                {mode === "welcome" ? (
                    <>
                        {/* Logo */}
                        <div className="mb-6 text-center">
                            <img src="/logo-icon.webp" alt="Two-Step" className="mx-auto mb-4 size-16 rounded-2xl shadow-md" />
                            <h1 className="font-display text-xl font-bold text-[#1A1F36]">
                                Bienvenue sur Two-Step
                            </h1>
                            <p className="mt-1 text-sm text-[#8E96B0]/60">
                                Le produit exact que tu cherches, à deux pas de chez toi.
                            </p>
                        </div>

                        {/* Value props */}
                        <div className="mb-8 space-y-4">
                            <ValueProp
                                icon={<MarkerPin01 className="size-4 text-[#4268FF]" />}
                                iconBg="bg-[#4268FF]/10"
                                title="Découvre ton quartier"
                                description="Stock réel, mis à jour par les commerçants"
                            />
                            <ValueProp
                                icon={<Heart className="size-4 text-[#D94F4F]" />}
                                iconBg="bg-[#D94F4F]/10"
                                title="Sauvegarde tes favoris"
                                description="On te prévient des nouveautés et des promos"
                            />
                        </div>

                        {/* CTAs */}
                        <button
                            type="button"
                            onClick={() => setMode("signup")}
                            className="w-full rounded-2xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition duration-150 active:opacity-90"
                        >
                            Créer un compte
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode("login")}
                            className="mt-2 w-full rounded-2xl border-2 border-[#E2E5F0] py-3.5 text-sm font-semibold text-[#1A1F36] transition duration-150 active:bg-[#F5F6FA]"
                        >
                            J'ai déjà un compte
                        </button>
                        <button
                            type="button"
                            onClick={dismiss}
                            className="mt-4 w-full py-2 text-xs text-[#8E96B0]/40 transition duration-150"
                        >
                            Passer pour le moment
                        </button>
                    </>
                ) : mode === "sizing" ? (
                    /* ── Sizing step (after signup) ── */
                    <>
                        <div className="mb-5 text-center">
                            <h2 className="font-display text-lg font-bold text-[#1A1F36]">
                                Tes préférences
                            </h2>
                            <p className="mt-1 text-xs text-[#8E96B0]/50">
                                Optionnel — pour te montrer les produits dans ta taille
                            </p>
                        </div>

                        {/* Clothing size */}
                        <div className="mb-5">
                            <label className="mb-2 block text-xs font-semibold text-[#1A1F36]">Taille vêtements</label>
                            <div className="flex flex-wrap gap-2">
                                {CLOTHING_SIZES.map((size) => (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => setClothingSize(clothingSize === size ? null : size)}
                                        className={cx(
                                            "rounded-xl px-4 py-2.5 text-sm font-medium transition duration-100",
                                            clothingSize === size
                                                ? "bg-[#4268FF] text-white shadow-sm"
                                                : "border-2 border-[#E2E5F0] text-[#1A1F36] active:border-[#4268FF]",
                                        )}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Shoe size */}
                        <div className="mb-6">
                            <label className="mb-2 block text-xs font-semibold text-[#1A1F36]">Pointure</label>
                            <div className="flex flex-wrap gap-1.5">
                                {SHOE_SIZES.map((size) => (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => setShoeSize(shoeSize === size ? null : size)}
                                        className={cx(
                                            "rounded-lg px-2.5 py-2 text-xs font-medium transition duration-100",
                                            shoeSize === size
                                                ? "bg-[#4268FF] text-white shadow-sm"
                                                : "border-2 border-[#E2E5F0] text-[#1A1F36] active:border-[#4268FF]",
                                        )}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleSizingSave}
                            className="w-full rounded-2xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition duration-150 active:opacity-90"
                        >
                            {clothingSize || shoeSize ? "Enregistrer" : "Passer cette étape"}
                        </button>
                    </>
                ) : (
                    /* ── Login / Signup form ── */
                    <>
                        <h2 className="mb-5 text-center font-display text-lg font-bold text-[#1A1F36]">
                            {mode === "signup" ? "Créer un compte" : "Se connecter"}
                        </h2>

                        {error && (
                            <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-[#D94F4F]">{error}</p>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-xl border-2 border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition duration-150 focus:border-[#4268FF] focus:shadow-[0_0_0_4px_rgba(66,104,255,0.1)]"
                                    placeholder="ton@email.fr"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-[#1A1F36]">Mot de passe</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-xl border-2 border-[#E2E5F0] bg-white px-4 py-3 text-sm text-[#1A1F36] outline-none transition duration-150 focus:border-[#4268FF] focus:shadow-[0_0_0_4px_rgba(66,104,255,0.1)]"
                                    placeholder={mode === "signup" ? "8 caractères minimum" : "••••••••"}
                                    required
                                    minLength={mode === "signup" ? 8 : undefined}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full rounded-2xl bg-[#4268FF] py-3.5 text-sm font-bold text-white shadow-sm transition duration-150 active:opacity-90 disabled:opacity-50"
                            >
                                {loading ? "Chargement..." : mode === "signup" ? "S'inscrire" : "Se connecter"}
                            </button>
                        </form>

                        <div className="mt-4 flex justify-between">
                            <button
                                type="button"
                                onClick={() => { setMode("welcome"); setError(""); }}
                                className="text-xs font-medium text-[#8E96B0]/50"
                            >
                                ← Retour
                            </button>
                            <button
                                type="button"
                                onClick={dismiss}
                                className="text-xs text-[#8E96B0]/40"
                            >
                                Passer
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function ValueProp({ icon, iconBg, title, description }: { icon: React.ReactNode; iconBg: string; title: string; description: string }) {
    return (
        <div className="flex items-start gap-3">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                {icon}
            </div>
            <div>
                <p className="text-sm font-semibold text-[#1A1F36]">{title}</p>
                <p className="text-xs text-[#8E96B0]/50">{description}</p>
            </div>
        </div>
    );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useAchievements } from "@/hooks/use-achievements";
import { AchievementBadgeCard } from "@/components/dashboard/achievement-badge";
import { ACHIEVEMENTS, ALL_ACHIEVEMENT_TYPES } from "@/lib/achievements";
import { generateSlug } from "@/lib/slug";
import { createClient } from "@/lib/supabase/client";

const DAYS = [
    { key: "mon", label: "Lundi" },
    { key: "tue", label: "Mardi" },
    { key: "wed", label: "Mercredi" },
    { key: "thu", label: "Jeudi" },
    { key: "fri", label: "Vendredi" },
    { key: "sat", label: "Samedi" },
    { key: "sun", label: "Dimanche" },
];

export default function StorePage() {
    const { merchant, loading, refetch } = useMerchant();
    const { achievements, loading: achievementsLoading } = useAchievements(false);
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [phone, setPhone] = useState("");
    const [description, setDescription] = useState("");
    const [hours, setHours] = useState<Record<string, { open: string; close: string } | null>>({});
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [photoUploading, setPhotoUploading] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (merchant) {
            setName(merchant.name ?? "");
            setAddress(merchant.address ?? "");
            setCity(merchant.city ?? "");
            setPhone(merchant.phone ?? "");
            setDescription(merchant.description ?? "");
            setHours(merchant.opening_hours ?? {});
            setPhotoUrl(merchant.photo_url ?? null);
        }
    }, [merchant]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !merchant) return;
        if (!file.type.startsWith("image/")) { toast("Type de fichier invalide", "error"); return; }
        if (file.size > 5 * 1024 * 1024) { toast("Fichier trop volumineux (max 5 Mo)", "error"); return; }

        setPhotoUploading(true);
        try {
            const supabase = createClient();
            const path = `${merchant.id}/storefront.${file.name.split(".").pop() ?? "jpg"}`;
            const { error: uploadError } = await supabase.storage
                .from("merchant-photos")
                .upload(path, file, { upsert: true, contentType: file.type });

            if (uploadError) {
                // Bucket may not exist — try direct API update with data URL
                const reader = new FileReader();
                reader.onload = async () => {
                    // Fallback: upload via merchant PATCH with a temporary URL
                    toast("Upload en cours...", "success");
                };
                reader.readAsDataURL(file);
                throw uploadError;
            }

            const { data: urlData } = supabase.storage.from("merchant-photos").getPublicUrl(path);
            const url = urlData.publicUrl + `?t=${Date.now()}`;

            // Update merchant photo_url
            const res = await window.fetch(`/api/merchants/${merchant.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ photo_url: url }),
            });
            if (!res.ok) throw new Error("Échec de la mise à jour");

            setPhotoUrl(url);
            toast("Photo mise à jour !");
            await refetch();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Échec de l'upload", "error");
        } finally {
            setPhotoUploading(false);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!name || !address || !city) {
            toast("Nom, adresse et ville sont obligatoires", "error");
            return;
        }
        setIsLoading(true);
        try {
            if (merchant) {
                // Update existing merchant
                const res = await window.fetch(`/api/merchants/${merchant.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, address, city, phone, description, opening_hours: hours }),
                });
                if (!res.ok) throw new Error("Échec de la mise à jour");
                toast("Boutique mise à jour");
            } else {
                // Create new merchant
                const res = await window.fetch("/api/merchants", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, address, city, phone, description, opening_hours: hours, status: "active" }),
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Échec de la création");
                }
                toast("Boutique créée !");
            }
            await refetch();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const toggleDay = (dayKey: string) => {
        setHours((prev) => ({
            ...prev,
            [dayKey]: prev[dayKey] ? null : { open: "09:00", close: "18:00" },
        }));
    };

    const updateHour = (dayKey: string, field: "open" | "close", value: string) => {
        setHours((prev) => ({
            ...prev,
            [dayKey]: prev[dayKey] ? { ...prev[dayKey]!, [field]: value } : { open: "09:00", close: "18:00", [field]: value },
        }));
    };

    const isCreating = !loading && !merchant;

    const shopSlug = merchant
        ? (merchant.slug ?? generateSlug(merchant.name, merchant.id))
        : null;

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Ma"
                titleAccent="boutique"
            />

            {/* Preview shop button */}
            {shopSlug && (
                <div className="animate-fade-up stagger-1 mb-6">
                    <a
                        href={`/shop/${shopSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
                        style={{ background: "#4268FF", color: "white" }}
                    >
                        👁 Voir ma boutique comme un client
                    </a>
                </div>
            )}

            {/* Creation banner */}
            {isCreating && (
                <div className="animate-fade-up stagger-2 mb-6 rounded-xl px-5 py-4" style={{ background: "rgba(66,104,255,0.1)" }}>
                    <p className="text-sm font-semibold text-[#4268FF]">Créez votre profil boutique</p>
                    <p className="mt-0.5 text-xs text-[#4268FF]/70">
                        Remplissez les informations ci-dessous pour activer votre compte marchand.
                    </p>
                </div>
            )}

            {/* SIRET status */}
            {merchant && (
                <div className="animate-fade-up stagger-2 mb-8 flex items-center gap-3 rounded-xl bg-white px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${merchant.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"}`}>
                        {merchant.status === "active" ? "Vérifié" : "En attente"}
                    </span>
                    {merchant.siret && (
                        <span className="text-xs text-gray-400">SIRET : {merchant.siret}</span>
                    )}
                </div>
            )}

            {/* Store photo upload */}
            {merchant && (
                <div className="animate-fade-up stagger-3 mb-6 max-w-xl">
                    <label className="mb-2 block text-sm font-medium text-gray-700">Photo de la boutique</label>
                    <div className="flex items-center gap-4">
                        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                            {photoUrl ? (
                                <img src={photoUrl} alt="Photo boutique" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full items-center justify-center text-2xl text-gray-300">📷</div>
                            )}
                            {photoUploading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                                    <span className="size-5 animate-spin rounded-full border-2 border-[#4268FF]/30 border-t-[#4268FF]" />
                                </div>
                            )}
                        </div>
                        <div>
                            <button
                                type="button"
                                onClick={() => photoInputRef.current?.click()}
                                disabled={photoUploading}
                                className="rounded-lg bg-[#4268FF]/10 px-4 py-2 text-sm font-medium text-[#4268FF] transition active:bg-[#4268FF]/20 disabled:opacity-50"
                            >
                                {photoUrl ? "Changer la photo" : "Ajouter une photo"}
                            </button>
                            <p className="mt-1 text-[11px] text-gray-400">JPEG, PNG ou WebP — max 5 Mo</p>
                            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                        </div>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="animate-fade-up stagger-3 space-y-5 max-w-xl">
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nom de la boutique</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="search-ts w-full" placeholder="Ma Boutique" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Adresse</label>
                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="search-ts w-full" placeholder="12 rue du Commerce" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Ville</label>
                    <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="search-ts w-full" placeholder="Paris" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Téléphone</label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="search-ts w-full" placeholder="06 12 34 56 78" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="search-ts w-full min-h-[80px] resize-y" placeholder="Ce que votre boutique propose..." />
                </div>

                {/* Opening hours */}
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Horaires d&apos;ouverture</label>
                    <div className="space-y-2">
                        {DAYS.map((day) => {
                            const h = hours[day.key];
                            return (
                                <div key={day.key} className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => toggleDay(day.key)}
                                        className={`w-24 rounded-lg px-3 py-1.5 text-xs font-medium ${h ? "bg-[#4268FF]/10 text-[#4268FF]" : "bg-gray-100 text-gray-400"}`}
                                    >
                                        {day.label}
                                    </button>
                                    {h ? (
                                        <>
                                            <input type="time" value={h.open} onChange={(e) => updateHour(day.key, "open", e.target.value)} className="search-ts w-28 text-sm" />
                                            <span className="text-xs text-gray-400">&rarr;</span>
                                            <input type="time" value={h.close} onChange={(e) => updateHour(day.key, "close", e.target.value)} className="search-ts w-28 text-sm" />
                                        </>
                                    ) : (
                                        <span className="text-xs text-gray-300">Fermé</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <button type="submit" className="btn-ts" disabled={isLoading}>
                    {isLoading ? "..." : isCreating ? "Créer ma boutique" : "Enregistrer"}
                </button>
            </form>

            {/* Trophées section */}
            {merchant && (
                <div className="mt-10 max-w-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-tertiary">
                            Mes trophées
                        </h2>
                        <Link href="/dashboard/achievements" className="text-xs font-medium text-[#4268FF] hover:underline no-underline">
                            Voir tout
                        </Link>
                    </div>
                    {achievementsLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="animate-pulse rounded-[20px] bg-white/60 h-16" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {ALL_ACHIEVEMENT_TYPES.slice(0, 5).map((type) => {
                                const def = ACHIEVEMENTS[type];
                                const achievement = achievements.find((a) => a.type === type);
                                return (
                                    <AchievementBadgeCard
                                        key={type}
                                        def={def}
                                        unlocked={!!achievement}
                                        unlockedAt={achievement?.unlocked_at}
                                    />
                                );
                            })}
                            {ALL_ACHIEVEMENT_TYPES.length > 5 && (
                                <Link
                                    href="/dashboard/achievements"
                                    className="block text-center text-xs text-[#8E96B0] hover:text-[#8E96B0] no-underline py-2 transition"
                                >
                                    Voir les {ALL_ACHIEVEMENT_TYPES.length - 5} autres trophées →
                                </Link>
                            )}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";

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
    const { merchant, refetch } = useMerchant();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const [name, setName] = useState("");
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [phone, setPhone] = useState("");
    const [description, setDescription] = useState("");
    const [hours, setHours] = useState<Record<string, { open: string; close: string } | null>>({});

    useEffect(() => {
        if (merchant) {
            setName(merchant.name ?? "");
            setAddress(merchant.address ?? "");
            setCity(merchant.city ?? "");
            setPhone(merchant.phone ?? "");
            setDescription(merchant.description ?? "");
            setHours(merchant.opening_hours ?? {});
        }
    }, [merchant]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!merchant) return;
        setIsLoading(true);
        try {
            const res = await window.fetch(`/api/merchants/${merchant.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, address, city, phone, description, opening_hours: hours }),
            });
            if (!res.ok) throw new Error("Échec de la mise à jour");
            await refetch();
            toast("Boutique mise à jour");
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

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Ma"
                titleAccent="boutique"
            />

            {/* SIRET status */}
            {merchant && (
                <div className="animate-fade-up stagger-2 mb-8 flex items-center gap-3 rounded-xl bg-white px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${merchant.status === "active" ? "bg-[var(--ts-sage-light)] text-[#5a9474]" : "bg-amber-50 text-amber-700"}`}>
                        {merchant.status === "active" ? "Vérifié" : "En attente"}
                    </span>
                    {merchant.siret && (
                        <span className="text-xs text-gray-400">SIRET : {merchant.siret}</span>
                    )}
                </div>
            )}

            <form onSubmit={handleSubmit} className="animate-fade-up stagger-3 space-y-5 max-w-xl">
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nom de la boutique</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="search-ts w-full" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Adresse</label>
                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="search-ts w-full" />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Ville</label>
                    <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="search-ts w-full" />
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
                                        className={`w-24 rounded-lg px-3 py-1.5 text-xs font-medium ${h ? "bg-[var(--ts-sage-light)] text-[#5a9474]" : "bg-gray-100 text-gray-400"}`}
                                    >
                                        {day.label}
                                    </button>
                                    {h ? (
                                        <>
                                            <input type="time" value={h.open} onChange={(e) => updateHour(day.key, "open", e.target.value)} className="search-ts w-28 text-sm" />
                                            <span className="text-xs text-gray-400">→</span>
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
                    {isLoading ? "..." : "Enregistrer"}
                </button>
            </form>
        </>
    );
}

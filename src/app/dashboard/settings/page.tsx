"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
    const { merchant } = useMerchant();
    const { toast } = useToast();
    const [email, setEmail] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            setEmail(data.user?.email ?? null);
        });
    }, []);

    const handlePasswordChange = async (e: FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 8) {
            toast("Le mot de passe doit contenir au moins 8 caractères", "error");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast("Les mots de passe ne correspondent pas", "error");
            return;
        }
        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            toast("Mot de passe mis à jour");
            setNewPassword("");
            setConfirmPassword("");
        } catch {
            toast("Erreur lors du changement de mot de passe", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const posProviders = [
        { name: "Square", status: "Bientôt" },
        { name: "SumUp", status: "Bientôt" },
        { name: "Zettle", status: "Bientôt" },
    ];

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title=""
                titleAccent="Réglages"
            />

            {/* Account */}
            <section className="animate-fade-up stagger-2 mb-10 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-gray-900">Compte</h2>
                <div className="mb-6 rounded-xl bg-white px-5 py-4">
                    <p className="text-xs text-gray-400">Email</p>
                    <p className="text-sm font-medium text-gray-900">{email ?? "—"}</p>
                </div>

                <form onSubmit={handlePasswordChange} className="space-y-4 rounded-xl bg-white px-5 py-5">
                    <p className="text-sm font-medium text-gray-700">Changer le mot de passe</p>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="search-ts w-full"
                        placeholder="Nouveau mot de passe (min 8 caractères)"
                    />
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="search-ts w-full"
                        placeholder="Confirmer le mot de passe"
                    />
                    <button type="submit" className="btn-ts" disabled={isLoading}>
                        {isLoading ? "..." : "Mettre à jour"}
                    </button>
                </form>
            </section>

            {/* POS */}
            <section className="animate-fade-up stagger-4 mb-10 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-gray-900">Caisse (POS)</h2>
                <div className="space-y-2">
                    {posProviders.map((pos) => (
                        <div key={pos.name} className="flex items-center justify-between rounded-xl bg-white px-5 py-4">
                            <span className="text-sm font-medium text-gray-900">{pos.name}</span>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-400">
                                {pos.status}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Subscription */}
            <section className="animate-fade-up stagger-6 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-gray-900">Abonnement</h2>
                <div className="rounded-xl bg-white px-5 py-4">
                    <p className="text-sm font-semibold" style={{ color: "var(--ts-terracotta)" }}>Gratuit (beta)</p>
                    <p className="mt-1 text-xs text-gray-400">L&apos;abonnement sera disponible au lancement officiel.</p>
                </div>
            </section>
        </>
    );
}

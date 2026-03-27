"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { usePOS } from "@/hooks/use-pos";
import { createClient } from "@/lib/supabase/client";

const POS_PROVIDERS = [
    { id: "square" as const, name: "Square", icon: "□" },
    { id: "lightspeed" as const, name: "Lightspeed", icon: "⚡" },
    { id: "shopify" as const, name: "Shopify", icon: "🛍" },
] as const;

const COMING_SOON_POS = ["SumUp", "Zettle"];

export default function SettingsPage() {
    const { merchant, refetch } = useMerchant();
    const { toast } = useToast();
    const { isConnected, connectedProvider, connecting, syncing, syncResult, connect, disconnect, sync } = usePOS(merchant, refetch);
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

    const handleConnect = async (provider: "square" | "lightspeed" | "shopify") => {
        try {
            await connect(provider);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur de connexion", "error");
        }
    };

    const handleDisconnect = async () => {
        try {
            await disconnect();
            toast("POS déconnecté");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        }
    };

    const handleSync = async () => {
        try {
            const result = await sync();
            if (result) {
                toast(`Sync : ${result.products_created} créés, ${result.products_updated} mis à jour, ${result.stock_updated} stocks`);
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur de synchronisation", "error");
        }
    };

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
            <section className="animate-fade-up stagger-3 mb-10 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-gray-900">Caisse (POS)</h2>

                <div className="space-y-2">
                    {POS_PROVIDERS.map(({ id, name, icon }) => {
                        const isThisConnected = connectedProvider === id;
                        const isOtherConnected = isConnected && !isThisConnected;

                        return (
                            <div key={id} className="rounded-xl bg-white px-5 py-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex size-10 items-center justify-center rounded-lg bg-gray-100 text-lg">
                                            {icon}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{name}</p>
                                            <p className="text-xs text-gray-400">
                                                {isThisConnected
                                                    ? merchant?.pos_last_sync
                                                        ? `Dernière sync : ${new Date(merchant.pos_last_sync).toLocaleString("fr-FR")}`
                                                        : "Connecté — jamais synchronisé"
                                                    : isOtherConnected
                                                        ? "Un autre POS est déjà connecté"
                                                        : "Synchronisez votre catalogue et stock"}
                                            </p>
                                        </div>
                                    </div>

                                    {isThisConnected ? (
                                        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[var(--ts-sage-light)] text-[#5a9474]">
                                            Connecté
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-400">
                                            Disponible
                                        </span>
                                    )}
                                </div>

                                {isThisConnected ? (
                                    <div className="flex gap-2">
                                        <button onClick={handleSync} className="btn-ts flex-1" disabled={syncing}>
                                            {syncing ? "Synchronisation..." : "Synchroniser"}
                                        </button>
                                        <button
                                            onClick={handleDisconnect}
                                            className="rounded-lg border border-red-200 px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition"
                                            disabled={connecting}
                                        >
                                            Déconnecter
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleConnect(id)}
                                        className="btn-ts w-full"
                                        disabled={connecting || isOtherConnected}
                                    >
                                        {connecting ? "Connexion..." : `Connecter ${name}`}
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {syncResult && (
                        <div className="rounded-lg bg-[var(--ts-sage-light)] px-4 py-3 text-xs text-[#5a9474]">
                            <p className="font-semibold">Synchronisation terminée</p>
                            <p className="mt-1">
                                {syncResult.products_created} produit(s) créé(s) · {syncResult.products_updated} mis à jour · {syncResult.stock_updated} stock(s)
                            </p>
                        </div>
                    )}

                    {/* Coming soon */}
                    {COMING_SOON_POS.map((name) => (
                        <div key={name} className="flex items-center justify-between rounded-xl bg-white px-5 py-4">
                            <span className="text-sm font-medium text-gray-900">{name}</span>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-400">
                                Bientôt
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Subscription */}
            <section className="animate-fade-up stagger-4 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-gray-900">Abonnement</h2>
                <div className="rounded-xl bg-white px-5 py-4">
                    <p className="text-sm font-semibold" style={{ color: "var(--ts-terracotta)" }}>
                        {merchant?.plan === "standard" ? "Standard" : merchant?.plan === "premium" ? "Premium" : "Gratuit"}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                        Two-Step est gratuit jusqu&apos;à 1 000 utilisateurs à Toulouse.
                    </p>
                </div>
            </section>
        </>
    );
}

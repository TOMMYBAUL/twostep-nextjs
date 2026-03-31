"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { PageHeader } from "@/components/dashboard/page-header";

type GoogleConnection = {
    google_merchant_id: string;
    products_pushed: number;
    last_feed_at: string | null;
    last_feed_status: string;
    last_feed_error: string | null;
    store_code: string;
};

export default function GooglePage() {
    const { merchant } = useMerchant();
    const [connection, setConnection] = useState<GoogleConnection | null>(null);
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);

    useEffect(() => {
        if (!merchant?.id) return;
        const supabase = createClient();
        supabase
            .from("google_merchant_connections")
            .select("google_merchant_id, products_pushed, last_feed_at, last_feed_status, last_feed_error, store_code")
            .eq("merchant_id", merchant.id)
            .maybeSingle()
            .then(({ data }: { data: GoogleConnection | null }) => {
                setConnection(data);
                setLoading(false);
            });
    }, [merchant?.id]);

    async function handleConnect() {
        const res = await fetch("/api/google/auth");
        const { auth_url } = await res.json();
        if (auth_url) window.location.href = auth_url;
    }

    async function handleDisconnect() {
        setDisconnecting(true);
        await fetch("/api/google/disconnect", { method: "POST" });
        setConnection(null);
        setDisconnecting(false);
    }

    function formatTimeAgo(dateStr: string): string {
        const diff = Date.now() - new Date(dateStr).getTime();
        const hours = Math.floor(diff / 3_600_000);
        if (hours < 1) return "il y a moins d'1h";
        if (hours < 24) return `il y a ${hours}h`;
        const days = Math.floor(hours / 24);
        return `il y a ${days}j`;
    }

    if (loading) {
        return (
            <>
                <PageHeader title="Google" storeName={merchant?.name} />
                <div className="mt-8 text-center text-sm text-[#8E96B0]">Chargement...</div>
            </>
        );
    }

    return (
        <>
            <PageHeader title="Google" storeName={merchant?.name} />

            <div className="mx-auto mt-6 max-w-lg">
                {!connection ? (
                    <div className="rounded-2xl border border-[#E8ECF4] bg-white p-8 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F5FF]">
                            <svg className="h-7 w-7 text-[#4285F4]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-semibold text-[#1A1F36]">
                            Rendez vos produits visibles sur Google
                        </h2>
                        <p className="mt-2 text-sm text-[#8E96B0]">
                            Vos produits apparaîtront gratuitement sur Google Shopping et Google Maps
                            quand un client cherche un produit près de chez vous.
                        </p>
                        <button
                            onClick={handleConnect}
                            className="mt-6 rounded-xl bg-[#4285F4] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#3367D6]"
                        >
                            Connecter à Google
                        </button>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-[#E8ECF4] bg-white p-8">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-semibold text-[#1A1F36]">Connecté à Google</p>
                                <p className="text-xs text-[#8E96B0]">
                                    Merchant ID : {connection.google_merchant_id}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            <div className="flex items-center justify-between rounded-xl bg-[#F8F9FC] px-4 py-3">
                                <span className="text-sm text-[#8E96B0]">Produits sur Google</span>
                                <span className="text-sm font-semibold text-[#1A1F36]">
                                    {connection.products_pushed}
                                </span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-[#F8F9FC] px-4 py-3">
                                <span className="text-sm text-[#8E96B0]">Dernière mise à jour</span>
                                <span className="text-sm font-semibold text-[#1A1F36]">
                                    {connection.last_feed_at
                                        ? formatTimeAgo(connection.last_feed_at)
                                        : "En attente"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-[#F8F9FC] px-4 py-3">
                                <span className="text-sm text-[#8E96B0]">Statut</span>
                                <span className={`text-sm font-semibold ${
                                    connection.last_feed_status === "success"
                                        ? "text-green-600"
                                        : connection.last_feed_status === "error"
                                            ? "text-red-500"
                                            : "text-[#8E96B0]"
                                }`}>
                                    {connection.last_feed_status === "success"
                                        ? "Succès"
                                        : connection.last_feed_status === "error"
                                            ? `Erreur : ${connection.last_feed_error ?? "inconnue"}`
                                            : "En attente"}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                            className="mt-6 text-sm text-red-500 transition hover:text-red-700 disabled:opacity-50"
                        >
                            {disconnecting ? "Déconnexion..." : "Déconnecter de Google"}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}

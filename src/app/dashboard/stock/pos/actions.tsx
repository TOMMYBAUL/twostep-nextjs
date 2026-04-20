"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/dashboard/toast";

interface Props {
    provider: string | null;
    merchantId: string;
}

export function PosConnectionActions({ provider, merchantId }: Props) {
    const router = useRouter();
    const { toast } = useToast();
    const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);

    const handleSync = async () => {
        if (!provider) return;
        setBusy("sync");
        try {
            const res = await fetch(`/api/pos/${provider}/sync`, { method: "POST" });
            if (!res.ok) throw new Error("sync failed");
            toast("Synchronisation lancée — patiente quelques secondes");
            setTimeout(() => router.refresh(), 3000);
        } catch {
            toast("Impossible de lancer la sync", "error");
        } finally {
            setBusy(null);
        }
    };

    const handleDisconnect = async () => {
        if (!provider) return;
        if (!confirm("Déconnecter cette caisse ? Tu passeras en gestion manuelle / clôture du soir.")) return;
        setBusy("disconnect");
        try {
            const res = await fetch(`/api/pos/${provider}/disconnect`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ merchant_id: merchantId }),
            });
            if (!res.ok) throw new Error("disconnect failed");
            toast("Caisse déconnectée");
            router.refresh();
        } catch {
            toast("Impossible de déconnecter", "error");
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex flex-wrap gap-2">
            <button
                type="button"
                onClick={handleSync}
                disabled={busy !== null || !provider}
                className="rounded-xl bg-brand-solid px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
                {busy === "sync" ? "Sync en cours…" : "Forcer une sync"}
            </button>
            <button
                type="button"
                onClick={handleDisconnect}
                disabled={busy !== null || !provider}
                className="rounded-xl border border-secondary bg-primary px-4 py-2.5 text-sm font-semibold text-secondary disabled:opacity-50"
            >
                Déconnecter
            </button>
        </div>
    );
}

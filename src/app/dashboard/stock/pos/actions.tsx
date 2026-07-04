"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/dashboard/toast";

interface Props {
    provider: string | null;
}

export function PosConnectionActions({ provider }: Props) {
    const router = useRouter();
    const { toast } = useToast();
    const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);

    const handleSync = async () => {
        if (!provider) return;
        setBusy("sync");
        try {
            // Route réelle : /api/pos/sync (le provider est résolu côté serveur
            // depuis la connexion du marchand — pas de segment [provider]).
            const res = await fetch("/api/pos/sync", { method: "POST" });
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
            // Route réelle : /api/pos/disconnect (sans provider ; la route résout
            // le marchand via la session — tout body merchant_id serait ignoré).
            const res = await fetch("/api/pos/disconnect", { method: "POST" });
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

interface PosConnectCardProps {
    id: string;
    label: string;
    blurb: string;
}

/**
 * Carte « Choisir une caisse » — bouton client, PAS un <Link> vers une route API :
 * un <Link> prefetch peut EXÉCUTER le handler sans clic, et la route /connect
 * n'existe pas (404). Pattern use-pos.ts : GET /api/pos/[provider]/auth → {auth_url}
 * → redirection navigateur vers l'OAuth du POS. Échec → toast, jamais de faux succès.
 */
export function PosConnectCard({ id, label, blurb }: PosConnectCardProps) {
    const { toast } = useToast();
    const [connecting, setConnecting] = useState(false);

    const handleConnect = async () => {
        setConnecting(true);
        try {
            const res = await fetch(`/api/pos/${id}/auth`);
            if (!res.ok) throw new Error("auth failed");
            const { auth_url } = await res.json();
            if (!auth_url) throw new Error("missing auth_url");
            window.location.href = auth_url;
            // Pas de setConnecting(false) ici : la redirection est en cours,
            // on garde le bouton désactivé pour éviter un double départ OAuth.
        } catch {
            toast(`Impossible de démarrer la connexion ${label} — réessaie`, "error");
            setConnecting(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            aria-busy={connecting}
            className="rounded-2xl border border-secondary bg-primary p-4 text-left transition hover:border-brand disabled:opacity-50"
        >
            <p className="text-sm font-semibold text-primary">{label}</p>
            <p className="mt-0.5 text-xs text-tertiary">{connecting ? "Redirection vers l'autorisation…" : blurb}</p>
        </button>
    );
}

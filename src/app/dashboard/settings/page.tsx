"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { usePOS } from "@/hooks/use-pos";
import { createClient } from "@/lib/supabase/client";

const OAUTH_POS = [
    { id: "square" as const, name: "Square", icon: "□" },
    { id: "shopify" as const, name: "Shopify", icon: "🛍" },
    { id: "lightspeed" as const, name: "Lightspeed", icon: "⚡" },
    { id: "zettle" as const, name: "Zettle", icon: "🅿️" },
] as const;

const DIRECT_POS = [
    { id: "clictill" as const, name: "Clictill", icon: "🇫🇷" },
    { id: "fastmag" as const, name: "Fastmag", icon: "🇫🇷" },
] as const;

const POS_PROVIDERS = [...OAUTH_POS, ...DIRECT_POS];

export default function SettingsPage() {
    return (
        <Suspense>
            <SettingsPageInner />
        </Suspense>
    );
}

function SettingsPageInner() {
    const { merchant, refetch } = useMerchant();
    const { toast } = useToast();
    const searchParams = useSearchParams();

    // Show OAuth callback feedback
    useEffect(() => {
        const pos = searchParams.get("pos");
        const error = searchParams.get("error");
        if (pos === "connected") {
            toast("Caisse connectée avec succès !", "success");
        } else if (error) {
            toast(error === "oauth_failed" ? "Échec de la connexion. Réessayez." : `Erreur : ${error}`, "error");
        }
    }, [searchParams, toast]);
    const { isConnected, connectedProvider, connecting, syncing, syncResult, connect, connectDirect, disconnect, sync } = usePOS(merchant, refetch);
    const [email, setEmail] = useState<string | null>(null);
    const [directFormOpen, setDirectFormOpen] = useState<string | null>(null);
    const [directFields, setDirectFields] = useState<Record<string, string>>({});
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [enhancing, setEnhancing] = useState(false);
    const [enhanceResult, setEnhanceResult] = useState<number | null>(null);
    const [instagramUrl, setInstagramUrl] = useState("");
    const [tiktokUrl, setTiktokUrl] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [savingSocial, setSavingSocial] = useState(false);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            setEmail(data.user?.email ?? null);
        });
    }, []);

    useEffect(() => {
        if (merchant) {
            const links = merchant.links ?? {};
            setInstagramUrl(merchant.instagram_url ?? links.instagram ?? "");
            setTiktokUrl(merchant.tiktok_url ?? links.tiktok ?? "");
            setWebsiteUrl(merchant.website_url ?? links.website ?? "");
        }
    }, [merchant]);

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

    const handleConnect = async (provider: string) => {
        try {
            await connect(provider as "square" | "lightspeed" | "shopify" | "zettle");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur de connexion", "error");
        }
    };

    const handleDirectConnect = async (provider: string) => {
        try {
            await connectDirect(provider as "clictill" | "fastmag", directFields);
            toast("Caisse connectée avec succès !", "success");
            setDirectFormOpen(null);
            setDirectFields({});
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur de connexion", "error");
        }
    };

    const handleDisconnect = async () => {
        if (!window.confirm("Voulez-vous vraiment déconnecter votre caisse ? Vous devrez la reconnecter pour synchroniser vos produits.")) return;
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
                toast(`Sync : ${result.products_created} créés, ${result.products_updated} mis à jour, ${result.stock_updated} stocks, ${result.promos_imported} promos`);
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur de synchronisation", "error");
        }
    };

    const handleSaveSocial = async (e: FormEvent) => {
        e.preventDefault();
        if (!merchant) return;
        setSavingSocial(true);
        try {
            const supabase = createClient();
            const currentLinks = merchant.links ?? {};
            const { error } = await supabase
                .from("merchants")
                .update({
                    instagram_url: instagramUrl || null,
                    tiktok_url: tiktokUrl || null,
                    website_url: websiteUrl || null,
                    links: {
                        ...currentLinks,
                        instagram: instagramUrl || undefined,
                        tiktok: tiktokUrl || undefined,
                        website: websiteUrl || undefined,
                    },
                })
                .eq("id", merchant.id);
            if (error) throw error;
            toast("Liens sociaux mis à jour");
            refetch();
        } catch {
            toast("Erreur lors de la mise à jour", "error");
        } finally {
            setSavingSocial(false);
        }
    };

    const handleEnhancePhotos = async () => {
        setEnhancing(true);
        setEnhanceResult(null);
        try {
            const res = await fetch("/api/images/enhance", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setEnhanceResult(data.jobs_created);
            if (data.jobs_created > 0) {
                toast(`${data.jobs_created} photo(s) en cours de traitement`);
            } else {
                toast("Toutes les photos sont déjà traitées");
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur", "error");
        } finally {
            setEnhancing(false);
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
                <h2 className="mb-4 text-base font-semibold text-primary">Compte</h2>
                <div className="mb-6 rounded-xl bg-primary px-5 py-4">
                    <p className="text-xs text-tertiary">Email</p>
                    <p className="text-sm font-medium text-primary">{email ?? "—"}</p>
                </div>

                <form onSubmit={handlePasswordChange} className="space-y-4 rounded-xl bg-primary px-5 py-5">
                    <p className="text-sm font-medium text-secondary">Changer le mot de passe</p>
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
                <h2 className="mb-4 text-base font-semibold text-primary">Caisse (POS)</h2>

                <div className="space-y-2">
                    {POS_PROVIDERS.map(({ id, name, icon }) => {
                        const isThisConnected = connectedProvider === id;
                        const isOtherConnected = isConnected && !isThisConnected;
                        const isDirect = DIRECT_POS.some((p) => p.id === id);
                        const isFormOpen = directFormOpen === id;

                        return (
                            <div key={id} className="rounded-xl bg-primary px-5 py-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-lg">
                                            {icon}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-primary">{name}</p>
                                            <p className="text-xs text-tertiary">
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
                                        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-brand-secondary text-brand-secondary">
                                            Connecté
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-tertiary">
                                            Disponible
                                        </span>
                                    )}
                                </div>

                                {isThisConnected ? (
                                    <div className="flex gap-2">
                                        <button type="button" onClick={handleSync} className="btn-ts flex-1" disabled={syncing}>
                                            {syncing ? "Synchronisation..." : "Synchroniser"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDisconnect}
                                            className="rounded-lg border border-error px-4 py-2.5 text-xs font-semibold text-error-primary hover:bg-error-secondary transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                                            disabled={connecting}
                                        >
                                            Déconnecter
                                        </button>
                                    </div>
                                ) : isDirect ? (
                                    <>
                                        {!isFormOpen ? (
                                            <button
                                                type="button"
                                                onClick={() => { setDirectFormOpen(id); setDirectFields({}); }}
                                                className="btn-ts w-full"
                                                disabled={connecting || isOtherConnected}
                                            >
                                                Configurer {name}
                                            </button>
                                        ) : (
                                            <DirectCredentialsForm
                                                provider={id}
                                                providerName={name}
                                                fields={directFields}
                                                setFields={setDirectFields}
                                                onSubmit={() => handleDirectConnect(id)}
                                                onCancel={() => { setDirectFormOpen(null); setDirectFields({}); }}
                                                connecting={connecting}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <button
                                        type="button"
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
                        <div className="rounded-lg bg-brand-secondary px-4 py-3 text-xs text-brand-secondary">
                            <p className="font-semibold">Synchronisation terminée</p>
                            <p className="mt-1">
                                {syncResult.products_created} produit(s) créé(s) · {syncResult.products_updated} mis à jour · {syncResult.stock_updated} stock(s) · {syncResult.promos_imported} promo(s)
                            </p>
                        </div>
                    )}

                </div>

                <p className="mt-4 text-center text-xs text-tertiary">
                    Pas de caisse ?{" "}
                    <a href="https://squareup.com/signup" target="_blank" rel="noopener noreferrer" className="font-medium underline text-brand-secondary focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none rounded">
                        Créez un compte Square gratuitement
                    </a>
                </p>
            </section>

            {/* Réseaux sociaux & Site web */}
            <section className="animate-fade-up stagger-4 mb-10 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-primary">Réseaux sociaux & Site web</h2>
                <div className="rounded-xl bg-primary px-5 py-5 space-y-4">
                    <p className="text-sm text-secondary">
                        Les clients verront ces liens sur votre page boutique. Ajoutez au moins votre Instagram.
                    </p>
                    <form onSubmit={handleSaveSocial} className="flex flex-col gap-3">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-tertiary">Instagram</span>
                            <input
                                type="text"
                                value={instagramUrl}
                                onChange={(e) => setInstagramUrl(e.target.value)}
                                placeholder="@votre_boutique ou URL complète"
                                className="search-ts w-full"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-tertiary">TikTok</span>
                            <input
                                type="text"
                                value={tiktokUrl}
                                onChange={(e) => setTiktokUrl(e.target.value)}
                                placeholder="@votre_boutique ou URL complète"
                                className="search-ts w-full"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-tertiary">Site web</span>
                            <input
                                type="text"
                                value={websiteUrl}
                                onChange={(e) => setWebsiteUrl(e.target.value)}
                                placeholder="https://www.votre-boutique.fr"
                                className="search-ts w-full"
                            />
                        </label>
                        <button type="submit" className="btn-ts self-start" disabled={savingSocial}>
                            {savingSocial ? "Enregistrement..." : "Enregistrer"}
                        </button>
                    </form>
                </div>
            </section>

            {/* Photos */}
            <section className="animate-fade-up stagger-6 mb-10 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-primary">Photos produit</h2>
                <div className="rounded-xl bg-primary px-5 py-5 space-y-4">
                    <p className="text-sm text-secondary">
                        Améliorez automatiquement vos photos produit : détourage, fond blanc, format uniforme.
                    </p>
                    <button
                        type="button"
                        onClick={handleEnhancePhotos}
                        className="btn-ts w-full"
                        disabled={enhancing}
                    >
                        {enhancing ? "Traitement en cours..." : "Améliorer les photos"}
                    </button>
                    {enhanceResult !== null && (
                        <p className="text-xs text-brand-secondary">
                            {enhanceResult} photo(s) en cours de traitement
                        </p>
                    )}
                </div>
            </section>

            {/* Subscription */}
            <section className="animate-fade-up stagger-7 max-w-xl">
                <h2 className="mb-4 text-base font-semibold text-primary">Abonnement</h2>
                <div className="rounded-xl bg-primary px-5 py-4">
                    <p className="text-sm font-semibold text-brand-secondary">
                        {merchant?.plan === "standard" ? "Standard" : merchant?.plan === "premium" ? "Premium" : "Gratuit"}
                    </p>
                    <p className="mt-1 text-xs text-tertiary">
                        Two-Step est gratuit jusqu&apos;à 1 000 utilisateurs à Toulouse.
                    </p>
                </div>
            </section>
        </>
    );
}

// ── Direct Credentials Form (Clictill / Fastmag) ──────────────

const CLICTILL_FIELDS = [
    { key: "baseUrl", label: "URL Clictill", placeholder: "https://votre-enseigne.clic-till.com", required: true },
    { key: "tokenArticle", label: "Token Article", placeholder: "Token depuis Outils > Paramètres webservices", required: true },
    { key: "tokenStock", label: "Token Stock", placeholder: "Token Stock", required: true },
    { key: "shopCode", label: "Code magasin (optionnel)", placeholder: "Ex: LYON, PARIS…", required: false },
];

const FASTMAG_FIELDS = [
    { key: "baseUrl", label: "URL Fastmag", placeholder: "https://votre-enseigne.fastmag.fr", required: true },
    { key: "enseigne", label: "Enseigne", placeholder: "Nom de l'enseigne", required: true },
    { key: "magasin", label: "Magasin", placeholder: "Code magasin", required: true },
    { key: "compte", label: "Compte", placeholder: "Identifiant API", required: true },
    { key: "motpasse", label: "Mot de passe", placeholder: "Mot de passe API", required: true },
];

function DirectCredentialsForm({
    provider,
    providerName,
    fields,
    setFields,
    onSubmit,
    onCancel,
    connecting,
}: {
    provider: string;
    providerName: string;
    fields: Record<string, string>;
    setFields: (fields: Record<string, string>) => void;
    onSubmit: () => void;
    onCancel: () => void;
    connecting: boolean;
}) {
    const fieldDefs = provider === "clictill" ? CLICTILL_FIELDS : FASTMAG_FIELDS;

    const allRequiredFilled = fieldDefs
        .filter((f) => f.required)
        .every((f) => fields[f.key]?.trim());

    return (
        <div className="space-y-3">
            <p className="text-xs text-tertiary">
                {provider === "clictill"
                    ? "Retrouvez vos tokens dans Clictill : Outils > Paramètres webservices"
                    : "Retrouvez vos identifiants dans Fastmag Connect ou contactez votre revendeur"}
            </p>
            {fieldDefs.map((f) => (
                <label key={f.key} className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-tertiary">
                        {f.label}{f.required && " *"}
                    </span>
                    <input
                        type={f.key === "motpasse" ? "password" : "text"}
                        value={fields[f.key] ?? ""}
                        onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        className="search-ts w-full"
                    />
                </label>
            ))}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onSubmit}
                    className="btn-ts flex-1"
                    disabled={connecting || !allRequiredFilled}
                >
                    {connecting ? "Connexion..." : `Connecter ${providerName}`}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-lg border border-secondary px-4 py-2.5 text-xs font-medium text-secondary hover:bg-secondary transition"
                >
                    Annuler
                </button>
            </div>
        </div>
    );
}

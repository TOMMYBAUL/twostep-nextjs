import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/error";
import { derivePosConnectionView, type PosConnectionRow } from "@/lib/stock/pos-connection-view";

import { PosConnectCard, PosConnectionActions } from "./actions";

const POS_CATALOG = [
    { id: "square", label: "Square", blurb: "iOS + Android, gratuit, dispo partout" },
    { id: "shopify", label: "Shopify", blurb: "E-commerce + POS physique" },
    { id: "lightspeed", label: "Lightspeed", blurb: "Retail pro, inventaire fin" },
    { id: "zettle", label: "Zettle", blurb: "PayPal, usage rapide, UE" },
] as const;

function formatRelative(iso: string | null): string {
    if (!iso) return "jamais";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h}h`;
    const d = Math.floor(h / 24);
    return `il y a ${d}j`;
}

function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto max-w-2xl">
            <Link href="/dashboard/stock/mon-stock" className="mb-2 inline-block text-sm text-tertiary hover:text-secondary">
                ← Mon stock
            </Link>

            <h1 className="mb-6 font-display text-xl font-bold uppercase text-primary">
                Synchronisation <span className="text-brand-secondary">POS</span>
            </h1>

            {children}
        </div>
    );
}

export default async function DashboardPosPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login?next=/dashboard/stock/pos");

    // Lecture marchand : on destructure l'`error` (≠ « pas de marchand »). Un blip DB ne doit
    // PAS être confondu avec une absence → sinon redirect /devenir-marchand éjecte un marchand
    // déjà onboardé (cf. pos-connection-view, classe LESSONS maillon 5/8 + E1/E3/E4).
    const { data: merchant, error: merchantError } = await supabase
        .from("merchants")
        .select("id, pos_type")
        .eq("user_id", user.id)
        .maybeSingle();
    if (merchantError) {
        captureError(merchantError, {
            route: "dashboard/stock/pos",
            phase: "load_merchant",
            userId: user.id,
            // PostgrestError n'est pas une instance d'Error → String() = "[object Object]" ;
            // forwarder les champs structurés garde le diagnostic dans Sentry.
            db_code: merchantError.code,
            db_message: merchantError.message,
            db_details: merchantError.details,
        });
    }

    let connection: PosConnectionRow | null = null;
    let connectionFailed = false;
    let productsCount: number | null = null;
    let productsCountFailed = false;

    if (merchant) {
        const connRes = await supabase
            .from("pos_connections")
            .select("provider, last_sync_at, last_sync_status, last_sync_error, expires_at")
            .eq("merchant_id", merchant.id)
            .order("last_sync_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
        connection = connRes.data;
        connectionFailed = !!connRes.error;
        if (connRes.error) {
            captureError(connRes.error, {
                route: "dashboard/stock/pos",
                phase: "load_connection",
                merchantId: merchant.id,
                db_code: connRes.error.code,
                db_message: connRes.error.message,
            });
        }

        const countRes = await supabase
            .from("products")
            .select("*", { count: "exact", head: true })
            .eq("merchant_id", merchant.id)
            .is("archived_at", null);
        productsCount = countRes.count;
        productsCountFailed = !!countRes.error;
        if (countRes.error) {
            captureError(countRes.error, {
                route: "dashboard/stock/pos",
                phase: "count_products",
                merchantId: merchant.id,
                db_code: countRes.error.code,
                db_message: countRes.error.message,
            });
        }
    }

    const view = derivePosConnectionView({
        merchantFailed: !!merchantError,
        hasMerchant: !!merchant,
        connectionFailed,
        connection,
        productsCountFailed,
        productsCount,
    });

    // Marchand réellement absent (lecture OK, 0 ligne) → onboarding.
    if (view.kind === "no-merchant") redirect("/devenir-marchand");

    // Échec de chargement (marchand ou connexion) : on le DIT, on ne masque pas en faux
    // « aucune caisse » et on n'éjecte pas le marchand. Erreur honnête + Réessayer (reload).
    if (view.kind === "error") {
        return (
            <PageShell>
                <div role="alert" className="rounded-2xl border border-error bg-primary p-6 text-center">
                    <p className="mb-2 text-sm font-semibold text-error-primary">
                        Impossible de charger l'état de votre caisse
                    </p>
                    <p className="mb-4 text-xs text-tertiary">
                        Vos connexions et votre stock sont bien là — c'est l'affichage qui n'a pas pu charger. Réessayez dans un instant.
                    </p>
                    <a
                        href="/dashboard/stock/pos"
                        className="inline-block rounded-xl bg-brand-solid px-4 py-2.5 text-sm font-semibold text-white no-underline"
                    >
                        Réessayer
                    </a>
                </div>
            </PageShell>
        );
    }

    const { hasConnection } = view;

    return (
        <PageShell>
            {hasConnection ? (
                <div className="mb-6 rounded-2xl border border-secondary bg-primary p-5">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tertiary">
                        POS connecté
                    </p>
                    <p className="mb-3 font-display text-lg font-semibold text-primary">
                        {(connection!.provider?.[0].toUpperCase() ?? "") + (connection!.provider?.slice(1) ?? "")}
                    </p>
                    <dl className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                        <div>
                            <dt className="text-xs text-tertiary">Dernière sync</dt>
                            <dd className="font-medium text-primary">{formatRelative(connection!.last_sync_at)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-tertiary">Statut</dt>
                            <dd className="font-medium text-primary">{connection!.last_sync_status ?? "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-tertiary">Produits suivis</dt>
                            <dd className="font-medium text-primary">{productsCount === null ? "—" : productsCount}</dd>
                        </div>
                    </dl>
                    {connection!.last_sync_error && (
                        <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
                            {connection!.last_sync_error}
                        </p>
                    )}
                    <PosConnectionActions provider={connection!.provider} />
                </div>
            ) : (
                <div className="mb-6 rounded-2xl border-2 border-dashed border-secondary bg-secondary p-6 text-center">
                    <p className="mb-2 text-2xl">🔌</p>
                    <p className="mb-2 text-sm font-semibold text-primary">Aucune caisse connectée</p>
                    <p className="text-xs text-tertiary">
                        Connecter un POS = stock mis à jour automatiquement à chaque vente.
                        Optionnel : tu peux rester en saisie manuelle ou clôture du soir.
                    </p>
                </div>
            )}

            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-tertiary">
                {hasConnection ? "Changer de caisse" : "Choisir une caisse"}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {POS_CATALOG.map((pos) => (
                    <PosConnectCard key={pos.id} id={pos.id} label={pos.label} blurb={pos.blurb} />
                ))}
            </div>

            <p className="mt-6 text-center text-xs text-tertiary">
                Pour les cas techniques (tokens, webhooks, mappings), voir
                {" "}
                <Link href="/dashboard/settings" className="text-brand-secondary">les paramètres avancés</Link>.
            </p>
        </PageShell>
    );
}

"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deriveReviewView, type ReviewBucket } from "@/lib/stock/review-view";
import { captureError } from "@/lib/error";

type ReviewProduct = {
    id: string;
    name: string;
    canonical_name: string | null;
    original_name: string | null;
    photo_url: string | null;
    photo_processed_url: string | null;
    original_image_url: string | null;
    ean: string | null;
    brand: string | null;
    pos_item_id: string | null;
    enrichment_source: string | null;
    enrichment_proposed_at: string | null;
    review_status: ReviewBucket;
};

const SOURCE_LABELS: Record<string, string> = {
    pos_bootstrap: "Sync POS",
    invoice: "Facture",
    csv_import: "Import CSV",
    scan: "Scan code-barres",
};

const POS_LABELS: Record<string, string> = {
    square: "Square",
    shopify: "Shopify",
    lightspeed: "Lightspeed",
    zettle: "Zettle",
    clictill: "Clictill",
    fastmag: "Fastmag",
};

// POS adapters that implement updatePosProduct (writeback). Other POS will skip
// the writeback silently — keep the UI honest and don't show the badge for them.
const POS_WRITEBACK_SUPPORTED = new Set(["square"]);

export function ReviewTable({
    products,
    posProvider,
    loadError = false,
}: {
    products: ReviewProduct[];
    posProvider: string | null;
    /** `true` si le SELECT products côté serveur a échoué (≠ « 0 produit à valider »). */
    loadError?: boolean;
}) {
    const [bucket, setBucket] = useState<ReviewBucket>("pending_review");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    // Source unique d'honnêteté de l'écran (erreur vs liste/vide + compteurs par bucket).
    const view = useMemo(
        () => deriveReviewView({ loadError, products, bucket }),
        [loadError, products, bucket],
    );

    // Échec de chargement : afficher une erreur honnête + Réessayer, JAMAIS un faux
    // « rien à valider » (les fiches pending resteraient invisibles en vitrine sans signal).
    if (view.kind === "error") {
        return (
            <div className="card-ts p-8 text-center" role="alert">
                <p className="text-primary text-sm font-medium">
                    Impossible de charger vos produits à valider.
                </p>
                <p className="text-tertiary mt-1 text-sm">
                    Une erreur est survenue. Vos fiches sont toujours là — réessayez.
                </p>
                <button
                    type="button"
                    onClick={() => startTransition(() => router.refresh())}
                    disabled={pending}
                    className="btn-ts mt-4 text-sm disabled:opacity-50"
                >
                    Réessayer
                </button>
            </div>
        );
    }

    const { filtered, counts } = view;

    function toggleSelect(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    // Une mutation qui ÉCHOUE ne doit JAMAIS être affichée comme réussie : sans la garde
    // `res.ok`, un 500 sur /validate laissait l'UI se rafraîchir comme si c'était passé, alors
    // que la fiche reste `pending_review` = invisible en vitrine, sans aucun signal au marchand
    // (même classe que l'écran Google E1 : durcir la vue ne suffit pas, les handlers d'action
    // ont la même obligation `res.ok`). On NE rafraîchit QUE sur succès réel.
    async function runAction(label: string, doFetch: () => Promise<Response>, onSuccess?: () => void) {
        startTransition(async () => {
            setActionError(null);
            try {
                const res = await doFetch();
                if (!res.ok) {
                    setActionError(`${label} : échec (code ${res.status}). Réessayez.`);
                    return;
                }
                onSuccess?.();
                router.refresh();
            } catch (err) {
                // Montrer l'erreur au marchand NE doit pas perdre le diagnostic : tracer
                // l'exception (réseau OU bug inattendu du fetch) avant le message UI.
                captureError(err, { route: "dashboard/stock/review", phase: "action", action: label });
                setActionError(`${label} : connexion interrompue. Réessayez.`);
            }
        });
    }

    function bulkValidate() {
        if (selected.size === 0) return;
        const ids = Array.from(selected);
        void runAction(
            "Validation de la sélection",
            () => fetch("/api/products/bulk-validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            }),
            () => setSelected(new Set()),
        );
    }

    function validateOne(id: string) {
        void runAction("Validation", () => fetch(`/api/products/${id}/validate`, { method: "POST" }));
    }

    function rejectOne(id: string, restoreOriginal: boolean) {
        void runAction("Rejet", () => fetch(`/api/products/${id}/reject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ restore_original: restoreOriginal }),
        }));
    }

    return (
        <div className="space-y-4">
            {/* Bucket tabs */}
            <div className="flex gap-2 border-b border-secondary">
                {(["pending_review", "validated", "rejected"] as const).map((b) => (
                    <button
                        key={b}
                        type="button"
                        onClick={() => { setBucket(b); setSelected(new Set()); }}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                            bucket === b
                                ? "border-brand text-brand-secondary"
                                : "border-transparent text-tertiary hover:text-secondary"
                        }`}
                    >
                        {b === "pending_review" ? "À valider" : b === "validated" ? "Validés" : "Rejetés"}
                        <span className="ml-2 text-xs text-quaternary">({counts[b]})</span>
                    </button>
                ))}
            </div>

            {/* Échec d'une action (validate/reject) — affiché honnêtement, jamais un faux succès */}
            {actionError && (
                <div className="rounded-lg border border-error bg-error-primary/10 px-4 py-2 text-sm text-error-primary" role="alert">
                    {actionError}
                </div>
            )}

            {/* Writeback hint — only when POS supports updatePosProduct */}
            {posProvider && POS_WRITEBACK_SUPPORTED.has(posProvider) && bucket === "pending_review" && filtered.length > 0 && (
                <div className="rounded-lg border border-secondary bg-secondary/30 px-4 py-2 text-xs text-tertiary">
                    Les produits validés avec un EAN trouvé seront aussi écrits dans votre {POS_LABELS[posProvider] ?? posProvider}.
                </div>
            )}

            {/* Bulk action — only on pending bucket */}
            {bucket === "pending_review" && filtered.length > 0 && (
                <div className="flex items-center justify-between">
                    <p className="text-tertiary text-sm">
                        {selected.size > 0
                            ? `${selected.size} sélectionné${selected.size > 1 ? "s" : ""}`
                            : `${filtered.length} produit${filtered.length > 1 ? "s" : ""} en attente`}
                    </p>
                    <button
                        type="button"
                        onClick={bulkValidate}
                        disabled={selected.size === 0 || pending}
                        className="btn-ts text-sm disabled:opacity-50"
                    >
                        Valider la sélection
                    </button>
                </div>
            )}

            {/* Empty state */}
            {filtered.length === 0 && (
                <div className="card-ts p-8 text-center">
                    <p className="text-tertiary text-sm">
                        {bucket === "pending_review"
                            ? "Rien à valider. Connectez un POS ou importez un catalogue pour commencer."
                            : bucket === "validated"
                                ? "Aucun produit validé pour l'instant."
                                : "Aucun produit rejeté."}
                    </p>
                </div>
            )}

            {/* Product list */}
            <div className="space-y-2">
                {filtered.map((p) => {
                    const photo = p.photo_processed_url ?? p.photo_url;
                    const proposedName = p.canonical_name ?? p.name;
                    const renamed = p.original_name && p.original_name !== proposedName;
                    return (
                        <div key={p.id} className="card-ts flex items-center gap-3 p-3">
                            {bucket === "pending_review" && (
                                <input
                                    type="checkbox"
                                    checked={selected.has(p.id)}
                                    onChange={() => toggleSelect(p.id)}
                                    aria-label="Sélectionner"
                                    className="size-4"
                                />
                            )}
                            <div className="size-12 shrink-0 overflow-hidden rounded bg-secondary">
                                {photo && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={photo} alt="" className="size-full object-cover" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-primary truncate text-sm font-medium">{proposedName}</p>
                                <p className="text-tertiary truncate text-xs">
                                    {p.brand ?? "—"}
                                    {p.ean && <span className="ml-2 font-mono">{p.ean}</span>}
                                    {renamed && <span className="ml-2 text-warning-primary">renommé</span>}
                                    {p.enrichment_source && (
                                        <span className="ml-2 text-quaternary">
                                            · {SOURCE_LABELS[p.enrichment_source] ?? p.enrichment_source}
                                        </span>
                                    )}
                                    {bucket === "pending_review" && p.pos_item_id && p.ean && posProvider && POS_WRITEBACK_SUPPORTED.has(posProvider) && (
                                        <span className="ml-2 text-brand-secondary">
                                            · 📤 {POS_LABELS[posProvider] ?? posProvider}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <Link
                                href={`/dashboard/stock/review/${p.id}`}
                                className="text-brand-secondary text-sm hover:underline"
                            >
                                Détail
                            </Link>
                            {bucket === "pending_review" && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => validateOne(p.id)}
                                        disabled={pending}
                                        className="btn-ts text-sm disabled:opacity-50"
                                    >
                                        Valider
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => rejectOne(p.id, true)}
                                        disabled={pending}
                                        className="text-tertiary hover:text-error-primary text-sm disabled:opacity-50"
                                        title="Garder le produit avec les données POS originales"
                                    >
                                        Rejeter
                                    </button>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

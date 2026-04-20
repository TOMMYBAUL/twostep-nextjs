"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";

type InvoiceItem = {
    id: string;
    name: string;
    quantity: number;
    facture_qty: number | null;
    received_qty: number | null;
    unit_price_ht: number | null;
    ean: string | null;
    status: string;
    product_id: string | null;
    is_flagged: boolean | null;
    flag_reason: string | null;
    match_type: "exact_ean" | "exact_name" | "fuzzy" | null;
};

type InvoiceDetail = {
    id: string;
    supplier_name: string | null;
    sender_email: string | null;
    received_at: string;
    status: string;
    kind: string | null;
    validated_at: string | null;
    file_url: string | null;
    invoice_items: InvoiceItem[];
};

export default function InvoiceDetailPage() {
    return (
        <Suspense fallback={<p className="text-secondary py-8 text-center">Chargement…</p>}>
            <InvoiceDetailInner />
        </Suspense>
    );
}

function InvoiceDetailInner() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const mode = searchParams.get("mode");
    const { merchant } = useMerchant();
    const { toast } = useToast();
    const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const [qty, setQty] = useState<Record<string, number>>({});
    const [sellingPrices, setSellingPrices] = useState<Record<string, string>>({});
    const [validating, setValidating] = useState(false);

    const fetchInvoice = useCallback(async () => {
        try {
            const res = await fetch(`/api/invoices/${id}`);
            if (res.ok) {
                const data = (await res.json()) as InvoiceDetail;
                setInvoice(data);
                const initChecked: Record<string, boolean> = {};
                const initQty: Record<string, number> = {};
                for (const it of data.invoice_items) {
                    initChecked[it.id] = it.status !== "rejected";
                    initQty[it.id] = it.received_qty ?? it.facture_qty ?? it.quantity ?? 0;
                }
                setChecked(initChecked);
                setQty(initQty);
            } else {
                toast("Impossible de charger la facture", "error");
            }
        } catch {
            toast("Erreur réseau", "error");
        }
        setLoading(false);
    }, [id, toast]);

    useEffect(() => { void fetchInvoice(); }, [fetchInvoice]);

    const isImported = invoice?.status === "imported";
    const isCorrective = invoice?.kind === "correction";
    const flaggedCount = invoice?.invoice_items.filter((i) => i.is_flagged).length ?? 0;

    const activeCount = useMemo(
        () => invoice?.invoice_items.filter((i) => checked[i.id]).length ?? 0,
        [invoice, checked],
    );
    const totalUnits = useMemo(
        () => invoice?.invoice_items.reduce((sum, i) => sum + (checked[i.id] ? qty[i.id] ?? 0 : 0), 0) ?? 0,
        [invoice, checked, qty],
    );

    const handleValidate = async () => {
        if (!invoice) return;
        setValidating(true);
        try {
            // 1. Apply line edits: rejected for unchecked, received_qty for checked.
            const itemsPayload = invoice.invoice_items.map((it) => ({
                id: it.id,
                status: checked[it.id] ? "validated" : "rejected",
                received_qty: checked[it.id] ? (qty[it.id] ?? it.quantity ?? 0) : 0,
            }));
            await fetch(`/api/invoices/${invoice.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: itemsPayload }),
            });

            // 2. Validate (group, match, create products)
            const prices: Record<string, number> = {};
            for (const [itemId, price] of Object.entries(sellingPrices)) {
                if (price) prices[itemId] = parseFloat(price);
            }
            const validateRes = await fetch(`/api/invoices/${invoice.id}/validate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ selling_prices: prices }),
            });
            if (!validateRes.ok) {
                toast("Erreur de validation", "error");
                setValidating(false);
                return;
            }

            // 3. Activate
            await fetch(`/api/invoices/${invoice.id}/activate`, { method: "POST" });

            toast("Livraison validée", {
                action: {
                    label: "Annuler",
                    onClick: async () => {
                        const res = await fetch(`/api/invoices/${invoice.id}/cancel`, { method: "POST" });
                        if (res.ok) {
                            toast("Validation annulée");
                            router.push("/dashboard/stock/factures");
                        } else {
                            toast("Impossible d'annuler", "error");
                        }
                    },
                },
                duration: 10_000,
            });
            setTimeout(() => router.push("/dashboard/stock/factures"), 1500);
        } catch {
            toast("Erreur réseau", "error");
        } finally {
            setValidating(false);
        }
    };

    const handleCancel = async () => {
        if (!invoice) return;
        if (!confirm("Annuler cette facture ? Au-delà de 10 minutes, un correctif négatif sera créé pour préserver l'historique.")) return;
        const res = await fetch(`/api/invoices/${invoice.id}/cancel`, { method: "POST" });
        const data = await res.json();
        if (res.ok) {
            toast(data.mode === "hard_undo" ? "Validation annulée" : "Correctif négatif créé");
            router.push("/dashboard/stock/factures");
        } else {
            toast(data.error ?? "Impossible d'annuler", "error");
        }
    };

    if (loading) return <p className="text-secondary py-8 text-center">Chargement…</p>;
    if (!invoice) return <p className="text-secondary py-8 text-center">Facture non trouvée.</p>;

    if (mode === "manual" && !isImported) {
        return <ManualMode invoiceId={invoice.id} onDone={() => router.push("/dashboard/stock/factures")} />;
    }

    return (
        <div className="pb-32">
            <Link href="/dashboard/stock/factures" className="mb-2 inline-block text-sm text-tertiary hover:text-secondary">
                ← Factures
            </Link>
            <h1 className="font-display text-xl font-bold uppercase text-primary">
                {isCorrective ? "Correctif négatif" : isImported ? "Livraison validée" : "Je valide ma livraison"}
            </h1>
            <p className="mb-4 text-xs text-tertiary">
                {invoice.supplier_name ?? invoice.sender_email ?? "—"} · {new Date(invoice.received_at).toLocaleDateString("fr-FR")} · {invoice.invoice_items.length} produits
            </p>

            {flaggedCount > 0 && !isImported && (
                <div className="mb-4 rounded-xl border border-warning-primary bg-warning-secondary px-4 py-3">
                    <p className="text-sm font-semibold text-warning-primary">
                        {flaggedCount} ligne{flaggedCount > 1 ? "s" : ""} à vérifier
                    </p>
                    <p className="mt-0.5 text-xs text-warning-primary/80">
                        L'IA n'a pas pu reconnaître certains produits — ajuste si nécessaire.
                    </p>
                </div>
            )}

            {invoice.file_url && (
                <a href={invoice.file_url} target="_blank" rel="noopener noreferrer" className="mb-4 inline-block text-xs text-brand-secondary">
                    📎 Voir le document original
                </a>
            )}

            <ul className="space-y-2">
                {invoice.invoice_items.map((item) => {
                    const isChecked = checked[item.id] ?? item.status !== "rejected";
                    const flag = item.is_flagged
                        ? item.flag_reason === "ean_not_found"
                            ? { emoji: "🔴", label: "À vérifier (EAN inconnu)", border: "border-l-4 border-error-primary" }
                            : { emoji: "🟡", label: "À créer au catalogue", border: "border-l-4 border-warning-primary" }
                        : null;

                    return (
                        <li
                            key={item.id}
                            className={`rounded-xl border border-secondary bg-primary px-3 py-3 ${flag?.border ?? ""} ${!isChecked ? "opacity-60" : ""}`}
                        >
                            <div className="flex items-start gap-3">
                                {!isImported && (
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                                        className="mt-1 size-4 accent-[#4268FF]"
                                    />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-primary">{item.name}</p>
                                    <p className="mt-0.5 text-xs text-tertiary">
                                        {item.ean ? `EAN ${item.ean}` : "EAN manquant"}
                                        {item.unit_price_ht != null ? ` · ${item.unit_price_ht} € HT` : ""}
                                    </p>
                                    {flag && (
                                        <p className="mt-1 text-[11px] font-medium text-primary">{flag.emoji} {flag.label}</p>
                                    )}
                                </div>
                                {!isImported && isChecked && (
                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                        <label className="text-[10px] text-tertiary">Reçu</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={qty[item.id] ?? 0}
                                            onChange={(e) => setQty((prev) => ({ ...prev, [item.id]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                                            className="w-16 rounded-lg bg-secondary px-2 py-1.5 text-center text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                        />
                                    </div>
                                )}
                                {isImported && (
                                    <span className="shrink-0 text-xs text-tertiary">
                                        {(item.received_qty ?? item.quantity) ?? 0} reçus
                                    </span>
                                )}
                            </div>

                            {!isImported && item.is_flagged && (
                                <div className="mt-2 rounded-lg bg-secondary_subtle px-3 py-2">
                                    <label className="text-[11px] font-medium text-tertiary">Prix de vente (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="12.90"
                                        value={sellingPrices[item.id] ?? ""}
                                        onChange={(e) => setSellingPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                        className="mt-1 w-full rounded-lg border border-secondary bg-white px-3 py-1.5 text-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                    />
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            {/* Sticky CTA */}
            {!isImported && !isCorrective && (
                <div className="fixed inset-x-0 bottom-0 z-40 border-t border-secondary bg-primary px-4 py-3 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] md:bottom-4 md:right-4 md:left-auto md:max-w-md md:rounded-2xl md:border">
                    <button
                        type="button"
                        onClick={handleValidate}
                        disabled={validating || activeCount === 0}
                        className="mb-2 w-full rounded-xl bg-brand-solid py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                    >
                        {validating ? "Import en cours…" : `Valider ma livraison · ${activeCount} produits · ${totalUnits} unités`}
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push(`/dashboard/invoices/${invoice.id}?mode=manual`)}
                        className="w-full text-center text-xs text-tertiary hover:text-secondary"
                    >
                        Parsing foiré — je corrige à la main
                    </button>
                </div>
            )}

            {isImported && !isCorrective && (
                <div className="mt-6">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="text-sm text-error-primary hover:underline"
                    >
                        Annuler cette facture
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Manual fallback: user re-enters products using scan or text ──
function ManualMode({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
    const { toast } = useToast();
    const [lines, setLines] = useState<Array<{ name: string; ean: string; quantity: number; price: string }>>([]);
    const [submitting, setSubmitting] = useState(false);

    const addLine = () => setLines((prev) => [...prev, { name: "", ean: "", quantity: 1, price: "" }]);

    const handleSubmit = async () => {
        const valid = lines.filter((l) => l.name.trim().length > 0 && l.quantity > 0);
        if (valid.length === 0) {
            toast("Ajoute au moins une ligne", "error");
            return;
        }
        setSubmitting(true);
        try {
            await fetch(`/api/invoices/${invoiceId}/validate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ manual_lines: valid }),
            });
            await fetch(`/api/invoices/${invoiceId}/activate`, { method: "POST" });
            toast("Saisie manuelle enregistrée");
            onDone();
        } catch {
            toast("Erreur réseau", "error");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="pb-32">
            <h1 className="font-display text-xl font-bold uppercase text-primary">Saisie manuelle</h1>
            <p className="mb-4 text-xs text-tertiary">
                L'IA n'a rien compris à la facture. Reprends les lignes à la main — tu peux scanner ou taper.
            </p>

            <ul className="mb-4 space-y-2">
                {lines.map((line, i) => (
                    <li key={i} className="rounded-xl border border-secondary bg-primary p-3">
                        <input
                            value={line.name}
                            onChange={(e) => setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, name: e.target.value } : l))}
                            placeholder="Nom du produit"
                            className="mb-2 w-full rounded-lg border border-secondary bg-white px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2">
                            <input
                                value={line.ean}
                                onChange={(e) => setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ean: e.target.value.replace(/\D/g, "").slice(0, 14) } : l))}
                                placeholder="EAN (optionnel)"
                                inputMode="numeric"
                                className="flex-1 rounded-lg border border-secondary bg-white px-3 py-2 text-xs"
                            />
                            <input
                                type="number"
                                min={1}
                                value={line.quantity}
                                onChange={(e) => setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : l))}
                                className="w-16 rounded-lg border border-secondary bg-white px-2 py-2 text-center text-sm"
                            />
                            <input
                                type="number"
                                step="0.01"
                                value={line.price}
                                onChange={(e) => setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, price: e.target.value } : l))}
                                placeholder="PU €"
                                className="w-20 rounded-lg border border-secondary bg-white px-2 py-2 text-sm"
                            />
                        </div>
                    </li>
                ))}
            </ul>

            <button
                type="button"
                onClick={addLine}
                className="mb-6 w-full rounded-xl border border-dashed border-secondary bg-secondary_subtle py-3 text-sm font-medium text-secondary hover:border-primary"
            >
                + Ajouter une ligne
            </button>

            <div className="fixed inset-x-0 bottom-0 border-t border-secondary bg-primary px-4 py-3">
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || lines.length === 0}
                    className="w-full rounded-xl bg-brand-solid py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                    {submitting ? "Enregistrement…" : `Valider ${lines.length} ligne${lines.length > 1 ? "s" : ""}`}
                </button>
            </div>
        </div>
    );
}

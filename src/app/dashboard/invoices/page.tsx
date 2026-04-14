"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StockTabs } from "@/components/dashboard/stock-tabs";
import { EmailInboundBanner } from "@/components/dashboard/email-inbound-banner";
import { EmailSetupGuide } from "@/components/dashboard/email-setup-guide";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useInvoices } from "@/hooks/use-invoices";

type IncomingItem = {
    id: string;
    quantity: number;
    created_at: string;
    invoice_id: string | null;
    product_id: string;
    products: { id: string; name: string; merchant_id: string };
};

type InvoiceRef = { id: string; supplier_name: string | null };

function PendingDeliveries({
    incoming,
    invoices,
    confirming,
    onConfirm,
}: {
    incoming: IncomingItem[];
    invoices: InvoiceRef[];
    confirming: string | null;
    onConfirm: (invoiceId: string) => void;
}) {
    const byInvoice = new Map<string, IncomingItem[]>();
    for (const item of incoming) {
        const key = item.invoice_id ?? "sans-facture";
        const list = byInvoice.get(key) ?? [];
        list.push(item);
        byInvoice.set(key, list);
    }

    return (
        <div className="mb-8">
            <h2 className="text-primary mb-3 text-base font-semibold">
                Livraisons en attente ({incoming.length} produit{incoming.length > 1 ? "s" : ""})
            </h2>
            <div className="space-y-3">
                {Array.from(byInvoice.entries()).map(([invoiceId, items]) => {
                    const matchingInvoice = invoices.find((inv) => inv.id === invoiceId);
                    return (
                        <div key={invoiceId} className="card-ts p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-primary text-sm font-medium">
                                        {matchingInvoice?.supplier_name ?? "Livraison"}
                                    </p>
                                    <p className="text-tertiary text-xs">
                                        {items.length} produit{items.length > 1 ? "s" : ""} —{" "}
                                        commandé le {new Date(items[0].created_at).toLocaleDateString("fr-FR")}
                                    </p>
                                    <ul className="text-secondary mt-1 space-y-0.5 text-xs">
                                        {items.slice(0, 5).map((item) => (
                                            <li key={item.id}>
                                                {item.products.name} × {item.quantity}
                                            </li>
                                        ))}
                                        {items.length > 5 && (
                                            <li className="text-tertiary">+ {items.length - 5} autre(s)...</li>
                                        )}
                                    </ul>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onConfirm(invoiceId)}
                                    disabled={confirming === invoiceId}
                                    className="btn-ts shrink-0 text-sm"
                                >
                                    {confirming === invoiceId ? "Confirmation..." : "Reçu ✓"}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    received: { label: "Reçue", className: "badge-ts badge-info" },
    extracting: { label: "Extraction...", className: "badge-ts badge-info" },
    parsed: { label: "En attente", className: "badge-ts badge-warn" },
    validated: { label: "Validée", className: "badge-ts badge-success" },
    imported: { label: "Importée", className: "badge-ts badge-success" },
    failed: { label: "Échec", className: "badge-ts badge-danger" },
};

const ACCEPTED = ".pdf,.xlsx,.xls,.csv";

export default function InvoicesPage() {
    const { merchant } = useMerchant();
    const { invoices, loading, uploadInvoice } = useInvoices(merchant?.id ?? null);
    const { toast } = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [incoming, setIncoming] = useState<IncomingItem[]>([]);
    const [confirming, setConfirming] = useState<string | null>(null);
    const [showGuide, setShowGuide] = useState(false);
    const [inboundAddress, setInboundAddress] = useState("");

    const fetchIncoming = useCallback(async () => {
        try {
            const res = await fetch("/api/stock/incoming");
            if (res.ok) {
                const data = await res.json();
                setIncoming(data.incoming ?? []);
            }
        } catch { /* silently fail */ }
    }, []);

    useEffect(() => { fetchIncoming(); }, [fetchIncoming]);

    useEffect(() => {
        fetch("/api/email/inbound-address")
            .then((r) => r.json())
            .then((data) => { if (data.address) setInboundAddress(data.address); })
            .catch(() => {});
    }, []);

    const handleConfirmDelivery = async (invoiceId: string) => {
        setConfirming(invoiceId);
        try {
            const res = await fetch("/api/stock/receive", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ invoice_id: invoiceId }),
            });
            if (res.ok) {
                const data = await res.json();
                toast(`${data.received} produit(s) reçu(s) — stock mis à jour`);
                await fetchIncoming();
            } else {
                toast("Erreur lors de la confirmation", "error");
            }
        } catch {
            toast("Erreur réseau", "error");
        }
        setConfirming(null);
    };

    const total = invoices.length;
    const pending = invoices.filter((i) => ["received", "extracting", "parsed"].includes(i.status)).length;
    const imported = invoices.filter((i) => i.status === "imported").length;
    const failed = invoices.filter((i) => i.status === "failed").length;

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const result = await uploadInvoice(file);
                if (result.status === "parsed") {
                    toast(`${file.name} : ${result.items_count} article(s) détecté(s)`);
                } else if (result.status === "failed") {
                    toast(`${file.name} : échec du parsing — ${result.error ?? "erreur inconnue"}`, "error");
                }
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : "Erreur d'upload", "error");
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Mes"
                titleAccent="entrées"
            />

            <StockTabs />

            <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                <MetricCard label="Total factures" value={total} staggerIndex={0} />
                <MetricCard label="En attente" value={pending} variant="warn" staggerIndex={1} />
                <MetricCard label="Importées" value={imported} staggerIndex={2} />
                <MetricCard label="Échouées" value={failed} variant="danger" staggerIndex={3} />
            </div>

            <EmailInboundBanner onShowGuide={() => setShowGuide(true)} />

            {/* Deliveries pending confirmation */}
            {incoming.length > 0 && (
                <PendingDeliveries
                    incoming={incoming}
                    invoices={invoices}
                    confirming={confirming}
                    onConfirm={handleConfirmDelivery}
                />
            )}

            {/* Upload zone */}
            <div
                role="button"
                tabIndex={0}
                aria-label="Glissez vos factures ici ou cliquez pour parcourir"
                className={`mb-8 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition ${
                    dragOver
                        ? "border-brand bg-brand-secondary"
                        : "border-secondary bg-primary hover:border-primary"
                } ${uploading ? "pointer-events-none opacity-60" : ""}`}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFiles(e.dataTransfer.files);
                }}
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPTED}
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                />
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary">
                    <svg className="size-5 text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
                    </svg>
                </div>
                <p className="text-sm font-medium text-secondary">
                    {uploading ? "Upload en cours..." : "Glissez vos factures ici ou cliquez pour parcourir"}
                </p>
                <p className="mt-1 text-xs text-quaternary">PDF, XLSX, XLS, CSV — max 10 Mo</p>
            </div>

            {loading ? (
                <p className="text-secondary py-8 text-center">Chargement...</p>
            ) : invoices.length === 0 ? (
                <div className="py-12 text-center">
                    <p className="text-secondary mb-2">Aucune facture pour le moment.</p>
                    <p className="text-tertiary text-sm">
                        Uploadez une facture ci-dessus ou connectez votre email dans les paramètres pour scanner automatiquement.
                    </p>
                </div>
            ) : (
                <div className="card-ts overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-secondary border-b">
                                <th className="text-secondary px-4 py-3 font-medium">Fournisseur</th>
                                <th className="text-secondary px-4 py-3 font-medium">Date</th>
                                <th className="text-secondary px-4 py-3 font-medium">Statut</th>
                                <th className="text-secondary px-4 py-3 font-medium">Lignes</th>
                                <th className="text-secondary px-4 py-3 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((invoice) => {
                                const status = STATUS_LABELS[invoice.status] ?? STATUS_LABELS.received;
                                return (
                                    <tr key={invoice.id} className="border-secondary hover:bg-secondary border-b transition">
                                        <td className="px-4 py-3">
                                            <p className="text-primary font-medium">
                                                {invoice.supplier_name ?? invoice.sender_email ?? "—"}
                                            </p>
                                            <p className="text-tertiary text-[11px]">
                                                {invoice.source === "email" ? "via email" : "upload manuel"}
                                            </p>
                                        </td>
                                        <td className="text-secondary px-4 py-3">
                                            {new Date(invoice.received_at).toLocaleDateString("fr-FR")}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={status.className}>{status.label}</span>
                                        </td>
                                        <td className="text-secondary px-4 py-3">
                                            {invoice.invoice_items?.length ?? 0}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/dashboard/invoices/${invoice.id}`}
                                                className="text-brand-secondary hover:text-brand-secondary_hover text-sm font-medium no-underline"
                                            >
                                                {invoice.status === "parsed" ? "Valider" : invoice.status === "validated" || invoice.status === "imported" ? "Consulter" : "Traiter"}
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {showGuide && inboundAddress && (
                <EmailSetupGuide
                    address={inboundAddress}
                    onClose={() => setShowGuide(false)}
                />
            )}
        </>
    );
}

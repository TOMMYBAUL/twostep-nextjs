"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
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

export function FacturesView() {
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
                <div className="space-y-4">
                    <InvoiceSection
                        label="À valider"
                        tone="warn"
                        invoices={invoices.filter((i) => ["received", "extracting", "parsed"].includes(i.status))}
                        defaultOpen
                    />
                    <InvoiceSection
                        label="Validées"
                        tone="success"
                        invoices={invoices.filter((i) => ["validated", "imported"].includes(i.status))}
                    />
                    <InvoiceSection
                        label="Refusées"
                        tone="danger"
                        invoices={invoices.filter((i) => i.status === "failed")}
                    />
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

/* ── Invoice section (3 buckets: à valider / validées / refusées) ── */

interface InvoiceSectionInvoice {
    id: string;
    status: string;
    supplier_name: string | null;
    sender_email: string | null;
    source: string | null;
    received_at: string;
    invoice_items: Array<{ id: string }>;
}

function InvoiceSection({
    label,
    tone,
    invoices,
    defaultOpen = false,
}: {
    label: string;
    tone: "warn" | "success" | "danger";
    invoices: InvoiceSectionInvoice[];
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen || invoices.length > 0 && tone === "warn");
    if (invoices.length === 0) return null;

    const counterClass = tone === "warn"
        ? "bg-warning-solid text-white"
        : tone === "success"
            ? "bg-success-solid text-white"
            : "bg-error-solid text-white";

    return (
        <div className="animate-fade-up overflow-hidden rounded-2xl border border-secondary bg-primary">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-primary_hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
                <span className="text-sm font-semibold text-primary">{label}</span>
                <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-bold ${counterClass}`}>
                    {invoices.length}
                </span>
                <span className="ml-auto text-tertiary" aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>
            {open && (
                <div className="divide-y divide-secondary border-t border-secondary">
                    {invoices.map((invoice) => {
                        const statusLabel = STATUS_LABELS[invoice.status] ?? STATUS_LABELS.received;
                        const ctaLabel = invoice.status === "parsed"
                            ? "Valider →"
                            : invoice.status === "validated" || invoice.status === "imported"
                                ? "Consulter"
                                : invoice.status === "failed"
                                    ? "Corriger →"
                                    : "Traiter →";
                        return (
                            <Link
                                key={invoice.id}
                                href={`/dashboard/invoices/${invoice.id}`}
                                className="flex items-center gap-3 px-4 py-3 no-underline transition hover:bg-secondary_subtle focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-primary">
                                        {invoice.supplier_name ?? invoice.sender_email ?? "Fournisseur inconnu"}
                                    </p>
                                    <p className="text-[11px] text-tertiary">
                                        {new Date(invoice.received_at).toLocaleDateString("fr-FR")} · {invoice.invoice_items?.length ?? 0} lignes · {invoice.source === "email" ? "email" : "upload"}
                                    </p>
                                </div>
                                <span className={statusLabel.className}>{statusLabel.label}</span>
                                <span className="text-xs font-medium text-brand-secondary">{ctaLabel}</span>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

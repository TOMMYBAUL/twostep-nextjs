"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";
import { useInvoices } from "@/hooks/use-invoices";

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
                titleAccent="factures"
            />

            <div className="mb-8 grid grid-cols-4 gap-4">
                <MetricCard label="Total factures" value={total} staggerIndex={0} />
                <MetricCard label="En attente" value={pending} variant="warn" staggerIndex={1} />
                <MetricCard label="Importées" value={imported} staggerIndex={2} />
                <MetricCard label="Échouées" value={failed} variant="danger" staggerIndex={3} />
            </div>

            {/* Upload zone */}
            <div
                className={`mb-8 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition ${
                    dragOver
                        ? "border-[var(--ts-ochre)] bg-[var(--ts-ochre-light)]"
                        : "border-gray-200 bg-white hover:border-gray-300"
                } ${uploading ? "pointer-events-none opacity-60" : ""}`}
                onClick={() => fileRef.current?.click()}
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
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-gray-100">
                    <svg className="size-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
                    </svg>
                </div>
                <p className="text-sm font-medium text-gray-700">
                    {uploading ? "Upload en cours..." : "Glissez vos factures ici ou cliquez pour parcourir"}
                </p>
                <p className="mt-1 text-xs text-gray-400">PDF, XLSX, XLS, CSV — max 10 Mo</p>
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
                <div className="card-ts overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-secondary border-b">
                                <th className="text-secondary px-4 py-3 font-medium">Fournisseur</th>
                                <th className="text-secondary px-4 py-3 font-medium">Date</th>
                                <th className="text-secondary px-4 py-3 font-medium">Statut</th>
                                <th className="text-secondary px-4 py-3 font-medium">Lignes</th>
                                <th className="text-secondary px-4 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((invoice) => {
                                const status = STATUS_LABELS[invoice.status] ?? STATUS_LABELS.received;
                                return (
                                    <tr key={invoice.id} className="border-secondary hover:bg-secondary border-b transition">
                                        <td className="text-primary px-4 py-3 font-medium">
                                            {invoice.supplier_name ?? invoice.sender_email ?? "—"}
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
                                                Voir
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

"use client";

import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
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

export default function InvoicesPage() {
    const { merchant } = useMerchant();
    const { invoices, loading } = useInvoices(merchant?.id ?? null);

    const total = invoices.length;
    const pending = invoices.filter((i) => ["received", "extracting", "parsed"].includes(i.status)).length;
    const imported = invoices.filter((i) => i.status === "imported").length;
    const failed = invoices.filter((i) => i.status === "failed").length;

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

            {loading ? (
                <p className="text-secondary py-8 text-center">Chargement...</p>
            ) : invoices.length === 0 ? (
                <div className="py-12 text-center">
                    <p className="text-secondary mb-2">Aucune facture pour le moment.</p>
                    <p className="text-tertiary text-sm">
                        Connectez votre email dans les paramètres pour scanner automatiquement vos factures.
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

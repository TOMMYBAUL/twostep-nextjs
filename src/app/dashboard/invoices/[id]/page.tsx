"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";

type InvoiceItem = {
    id: string;
    name: string;
    quantity: number;
    unit_price_ht: number | null;
    ean: string | null;
    status: string;
    product_id: string | null;
    match_type: "exact_ean" | "exact_name" | "fuzzy" | null;
};

type InvoiceDetail = {
    id: string;
    supplier_name: string | null;
    sender_email: string | null;
    received_at: string;
    status: string;
    file_url: string | null;
    invoice_items: InvoiceItem[];
};

export default function InvoiceDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { merchant } = useMerchant();
    const { toast } = useToast();
    const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [sellingPrices, setSellingPrices] = useState<Record<string, string>>({});
    const [validating, setValidating] = useState(false);
    const [activating, setActivating] = useState(false);
    const [result, setResult] = useState<{ products_created: number; products_updated: number; stock_updated: number; fuzzy_matched?: number } | null>(null);
    const [activateResult, setActivateResult] = useState<{ pushed: number; synced: boolean } | null>(null);

    const fetchInvoice = useCallback(async () => {
        try {
            const res = await fetch(`/api/invoices/${id}`);
            if (res.ok) {
                setInvoice(await res.json());
            } else {
                toast("Impossible de charger la facture", "error");
            }
        } catch {
            toast("Erreur réseau lors du chargement", "error");
        }
        setLoading(false);
    }, [id, toast]);

    useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

    const handleReject = async (itemId: string) => {
        try {
            const res = await fetch(`/api/invoices/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: [{ id: itemId, status: "rejected" }] }),
            });
            if (!res.ok) throw new Error("Erreur serveur");
            await fetchInvoice();
        } catch {
            toast("Impossible de rejeter cette ligne", "error");
        }
    };

    const handleValidate = async () => {
        setValidating(true);
        try {
            const prices: Record<string, number> = {};
            for (const [itemId, price] of Object.entries(sellingPrices)) {
                if (price) prices[itemId] = parseFloat(price);
            }
            const res = await fetch(`/api/invoices/${id}/validate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ selling_prices: prices }),
            });
            if (res.ok) {
                setResult(await res.json());
                await fetchInvoice();
            } else {
                toast("Erreur lors de la validation", "error");
            }
        } catch {
            toast("Erreur réseau lors de la validation", "error");
        }
        setValidating(false);
    };

    const handleActivate = async () => {
        setActivating(true);
        try {
            const res = await fetch(`/api/invoices/${id}/activate`, {
                method: "POST",
            });
            if (res.ok) {
                const data = await res.json();
                setActivateResult(data);
                toast(`${data.pushed} produits poussés vers la caisse`, "success");
                await fetchInvoice();
            } else {
                const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
                toast(err.error || "Erreur lors de l'activation", "error");
            }
        } catch {
            toast("Erreur réseau lors de l'activation", "error");
        }
        setActivating(false);
    };

    if (loading) return <p className="text-secondary py-8 text-center">Chargement...</p>;
    if (!invoice) return <p className="text-secondary py-8 text-center">Facture non trouvée.</p>;

    const isImported = invoice.status === "imported";
    const isValidated = invoice.status === "validated";
    const activeItems = invoice.invoice_items.filter((i) => i.status !== "rejected");

    return (
        <>
            <PageHeader
                storeName={merchant?.name}
                title="Facture"
                titleAccent={invoice.supplier_name ?? ""}
            />

            <div className="card-ts mb-6 p-4">
                <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                    <div>
                        <span className="text-tertiary">Fournisseur</span>
                        <p className="text-primary font-medium">{invoice.supplier_name ?? "—"}</p>
                    </div>
                    <div>
                        <span className="text-tertiary">Email</span>
                        <p className="text-primary font-medium">{invoice.sender_email ?? "—"}</p>
                    </div>
                    <div>
                        <span className="text-tertiary">Date</span>
                        <p className="text-primary font-medium">{new Date(invoice.received_at).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <div>
                        <span className="text-tertiary">Statut</span>
                        <p className="text-primary font-medium">{invoice.status}</p>
                    </div>
                </div>
                {invoice.file_url && (
                    <a href={invoice.file_url} target="_blank" rel="noopener noreferrer" className="text-brand-secondary mt-2 inline-block text-sm">
                        Voir le PDF
                    </a>
                )}
            </div>

            {result && (
                <div className="bg-success-secondary mb-6 rounded-lg p-4 text-sm">
                    <p className="text-success-primary font-medium">Import terminé !</p>
                    <p className="text-primary">
                        {result.products_created} produits créés, {result.products_updated} mis à jour, {result.stock_updated} stocks ajustés
                        {result.fuzzy_matched ? ` (dont ${result.fuzzy_matched} correspondances approximatives)` : ""}
                    </p>
                </div>
            )}

            <div className="card-ts overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-secondary border-b">
                            <th className="text-secondary px-4 py-3 font-medium">Produit</th>
                            <th className="text-secondary px-4 py-3 font-medium">Qté</th>
                            <th className="text-secondary px-4 py-3 font-medium">Prix achat HT</th>
                            <th className="text-secondary px-4 py-3 font-medium">EAN</th>
                            <th className="text-secondary px-4 py-3 font-medium">Statut</th>
                            {!isImported && !isValidated && <th className="text-secondary px-4 py-3 font-medium">Prix vente</th>}
                            {!isImported && !isValidated && <th className="text-secondary px-4 py-3 font-medium">Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {invoice.invoice_items.map((item) => (
                            <tr key={item.id} className={`border-secondary border-b ${item.status === "rejected" ? "opacity-40" : ""}`}>
                                <td className="text-primary px-4 py-3 font-medium">{item.name}</td>
                                <td className="text-secondary px-4 py-3">{item.quantity}</td>
                                <td className="text-secondary px-4 py-3">{item.unit_price_ht != null ? `${item.unit_price_ht} €` : "—"}</td>
                                <td className="text-secondary px-4 py-3 font-mono text-xs">{item.ean ?? "—"}</td>
                                <td className="px-4 py-3">
                                    <span className={`badge-ts ${item.status === "rejected" ? "badge-danger" : item.status === "validated" ? "badge-success" : "badge-info"}`}>
                                        {item.status}
                                    </span>
                                    {item.match_type === "fuzzy" && (
                                        <span className="badge-ts badge-warning ml-1" title="Correspondance approximative — vérifiez le produit associé">
                                            fuzzy
                                        </span>
                                    )}
                                </td>
                                {!isImported && !isValidated && (
                                    <td className="px-4 py-3">
                                        {item.status !== "rejected" && (
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="input-ts w-24"
                                                placeholder="€"
                                                value={sellingPrices[item.id] ?? ""}
                                                onChange={(e) => setSellingPrices((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                            />
                                        )}
                                    </td>
                                )}
                                {!isImported && !isValidated && (
                                    <td className="px-4 py-3">
                                        {item.status !== "rejected" && (
                                            <button onClick={() => handleReject(item.id)} className="text-error-primary text-sm hover:underline">
                                                Rejeter
                                            </button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {activateResult && (
                <div className="bg-success-secondary mb-6 rounded-lg p-4 text-sm">
                    <p className="text-success-primary font-medium">Envoi vers la caisse terminé !</p>
                    <p className="text-primary">
                        {activateResult.pushed} produits poussés
                        {activateResult.synced ? " — synchronisation OK" : " — synchronisation en attente"}
                    </p>
                </div>
            )}

            {!isImported && !isValidated && activeItems.length > 0 && (
                <div className="mt-6 flex gap-4">
                    <button onClick={() => router.push("/dashboard/invoices")} className="btn-ts-secondary">
                        Retour
                    </button>
                    <button onClick={handleValidate} disabled={validating} className="btn-ts">
                        {validating ? "Validation en cours..." : `Valider (${activeItems.length} lignes)`}
                    </button>
                </div>
            )}

            {isValidated && (
                <div className="mt-6 flex gap-4">
                    <button onClick={() => router.push("/dashboard/invoices")} className="btn-ts-secondary">
                        Retour
                    </button>
                    <button onClick={handleActivate} disabled={activating} className="btn-ts">
                        {activating ? "Envoi en cours..." : "Pousser vers la caisse"}
                    </button>
                </div>
            )}
        </>
    );
}

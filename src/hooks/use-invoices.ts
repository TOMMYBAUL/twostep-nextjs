"use client";

import { useCallback, useEffect, useState } from "react";
import type { Invoice } from "@/lib/types";
import { DEMO_MODE, demoInvoices } from "@/lib/demo-data";

type InvoiceWithItems = Invoice & { invoice_items: Array<{
    id: string; name: string; quantity: number; unit_price_ht: number | null;
    ean: string | null; status: string; product_id: string | null;
}> };

export function useInvoices(merchantId: string | null) {
    const [invoices, setInvoices] = useState<InvoiceWithItems[]>(DEMO_MODE ? demoInvoices : []);
    const [loading, setLoading] = useState(!DEMO_MODE);

    const fetchInvoices = useCallback(async () => {
        if (DEMO_MODE) { setInvoices(demoInvoices); setLoading(false); return; }
        setLoading(true);
        try {
            const res = await fetch("/api/invoices");
            if (res.ok) setInvoices(await res.json());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (merchantId) fetchInvoices();
    }, [merchantId, fetchInvoices]);

    const validateInvoice = useCallback(async (
        invoiceId: string,
        sellingPrices: Record<string, number>
    ) => {
        const res = await fetch(`/api/invoices/${invoiceId}/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selling_prices: sellingPrices }),
        });
        if (res.ok) {
            await fetchInvoices();
            return await res.json();
        }
        return null;
    }, [fetchInvoices]);

    const updateItems = useCallback(async (
        invoiceId: string,
        items: Array<{ id: string; name?: string; quantity?: number; unit_price_ht?: number; ean?: string; status?: string }>
    ) => {
        const res = await fetch(`/api/invoices/${invoiceId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
        });
        if (res.ok) await fetchInvoices();
    }, [fetchInvoices]);

    const uploadInvoice = useCallback(async (file: File, supplierName?: string) => {
        const formData = new FormData();
        formData.append("file", file);
        if (supplierName) formData.append("supplier_name", supplierName);

        const res = await fetch("/api/invoices/upload", {
            method: "POST",
            body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        await fetchInvoices();
        return data as { id: string; status: string; items_count?: number; error?: string };
    }, [fetchInvoices]);

    return { invoices, loading, fetchInvoices, validateInvoice, updateItems, uploadInvoice };
}

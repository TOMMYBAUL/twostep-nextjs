import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter, type POSProduct } from "@/lib/pos";
import { decrypt } from "@/lib/email/encryption";
import { syncMerchantPOS } from "@/lib/pos/sync-engine";
import { captureError } from "@/lib/error";

/**
 * Activate an invoice: push parsed items to the merchant's POS,
 * then trigger a sync to pull them into Two-Step.
 *
 * Flow: invoice_items → POSProduct[] → pushCatalog → sync engine
 */
export async function activateInvoice(invoiceId: string): Promise<{
    pushed: number;
    synced: boolean;
    error?: string;
}> {
    const supabase = createAdminClient();

    // 1. Get invoice + merchant + items
    const { data: invoice, error: invoiceErr } = await supabase
        .from("invoices")
        .select("id, merchant_id, supplier_name, status")
        .eq("id", invoiceId)
        .single();

    if (invoiceErr || !invoice) {
        throw new Error(`Invoice not found: ${invoiceId}`);
    }

    if (invoice.status !== "parsed" && invoice.status !== "validated") {
        throw new Error(`Invoice status must be 'parsed' or 'validated', got '${invoice.status}'`);
    }

    const { data: items, error: itemsErr } = await supabase
        .from("invoice_items")
        .select("id, name, ean, sku, quantity, unit_price_ht, status")
        .eq("invoice_id", invoiceId)
        .in("status", ["detected", "enriched", "validated"]);

    if (itemsErr || !items || items.length === 0) {
        throw new Error("No items to activate");
    }

    // 2. Get merchant POS connection
    const { data: conn, error: connErr } = await supabase
        .from("pos_connections")
        .select("provider, access_token, shop_domain")
        .eq("merchant_id", invoice.merchant_id)
        .single();

    if (connErr || !conn) {
        throw new Error("Merchant has no POS connected");
    }

    const adapter = getAdapter(conn.provider);
    const accessToken = decrypt(conn.access_token);

    // 3. Convert invoice items to POS products
    const products: POSProduct[] = items.map((item) => ({
        pos_item_id: `inv-${item.id}`,
        name: item.name,
        ean: item.ean ?? null,
        price: item.unit_price_ht ? Number(item.unit_price_ht) : null,
        category: null,
        photo_url: null,
    }));

    // 4. Push to POS
    try {
        await adapter.pushCatalog(accessToken, products, {
            shopDomain: conn.shop_domain ?? undefined,
        });
    } catch (pushErr) {
        captureError(pushErr, { invoiceId, provider: conn.provider });
        throw new Error(`Failed to push to ${conn.provider}: ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`);
    }

    // 5. Update invoice status
    await supabase
        .from("invoices")
        .update({ status: "imported", validated_at: new Date().toISOString() })
        .eq("id", invoiceId);

    // 6. Update invoice_items status
    await supabase
        .from("invoice_items")
        .update({ status: "validated" })
        .eq("invoice_id", invoiceId)
        .in("status", ["detected", "enriched"]);

    // 7. Trigger sync to pull the new products from POS into Two-Step
    let synced = false;
    try {
        await syncMerchantPOS(invoice.merchant_id, conn.provider);
        synced = true;
    } catch (syncErr) {
        captureError(syncErr, { invoiceId, phase: "post-activate-sync" });
    }

    return { pushed: products.length, synced };
}

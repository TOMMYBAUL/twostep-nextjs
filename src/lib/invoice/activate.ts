import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter, type POSProduct } from "@/lib/pos";
import { decrypt } from "@/lib/email/encryption";
import { captureError } from "@/lib/error";

/**
 * Activate an invoice: push the GROUPED products (created by validate)
 * to the merchant's POS. Does NOT trigger a sync — the products are
 * already in Two-Step's DB from validate.
 *
 * Flow: products (from validate) → POSProduct[] → pushCatalog
 */
export async function activateInvoice(invoiceId: string): Promise<{
    pushed: number;
    synced: boolean;
    error?: string;
}> {
    const supabase = createAdminClient();

    // 1. Get invoice
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

    // 2. Get the PRODUCTS created by validate (not the raw invoice_items)
    //    These are already grouped by model with sizes consolidated.
    const { data: invoiceItems } = await supabase
        .from("invoice_items")
        .select("product_id")
        .eq("invoice_id", invoiceId)
        .not("product_id", "is", null);

    if (!invoiceItems || invoiceItems.length === 0) {
        throw new Error("No validated products to push — run validate first");
    }

    // Get unique product IDs (multiple invoice_items point to same product after grouping)
    const productIds = [...new Set(invoiceItems.map((i) => i.product_id as string))];

    const { data: products, error: prodErr } = await supabase
        .from("products")
        .select("id, name, canonical_name, ean, price, category, photo_url, pos_item_id")
        .in("id", productIds);

    if (prodErr || !products || products.length === 0) {
        throw new Error("Products not found in database");
    }

    // 3. Get merchant POS connection (optional for non-POS merchants)
    const { data: conn } = await supabase
        .from("pos_connections")
        .select("provider, access_token, shop_domain")
        .eq("merchant_id", invoice.merchant_id)
        .maybeSingle();

    // Non-POS merchants: products are already in Two-Step DB from validate.
    // Just update invoice status — no POS push needed.
    if (!conn) {
        await supabase
            .from("invoices")
            .update({ status: "imported", validated_at: new Date().toISOString() })
            .eq("id", invoiceId);

        return { pushed: 0, synced: false };
    }

    const adapter = getAdapter(conn.provider);
    const accessToken = decrypt(conn.access_token);

    // 4. Convert grouped products to POS format
    const posProducts: POSProduct[] = products
        .filter((p) => !p.pos_item_id) // Only push products not already in POS
        .map((p) => ({
            pos_item_id: `ts-${p.id}`,
            name: p.canonical_name ?? p.name,
            ean: p.ean ?? null,
            price: p.price ? Number(p.price) : null,
            category: p.category ?? null,
            photo_url: p.photo_url ?? null,
        }));

    if (posProducts.length === 0) {
        // All products already exist in POS — just update status
        await supabase
            .from("invoices")
            .update({ status: "imported", validated_at: new Date().toISOString() })
            .eq("id", invoiceId);

        return { pushed: 0, synced: false };
    }

    // 5. Push to POS and get ID mappings (skip for POS that don't support push)
    let idMappings: Record<string, string> = {};
    const PUSH_UNSUPPORTED = ["clictill", "fastmag"];
    if (!PUSH_UNSUPPORTED.includes(conn.provider)) {
        try {
            idMappings = await adapter.pushCatalog(accessToken, posProducts, {
                shopDomain: conn.shop_domain ?? undefined,
            });
        } catch (pushErr) {
            captureError(pushErr, { invoiceId, provider: conn.provider });
            throw new Error(`Failed to push to ${conn.provider}: ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`);
        }
    }

    // 6. Store POS IDs on our products — links Two-Step ↔ POS
    for (const product of products) {
        const tempId = `ts-${product.id}`;
        const posId = idMappings[tempId];
        if (posId) {
            await supabase
                .from("products")
                .update({ pos_item_id: posId, pos_provider: conn.provider })
                .eq("id", product.id);
        }
    }

    // 7. Update invoice status
    await supabase
        .from("invoices")
        .update({ status: "imported", validated_at: new Date().toISOString() })
        .eq("id", invoiceId);

    // NO sync trigger — products are already in Two-Step DB from validate.
    // The next scheduled sync (every 15 min) will reconcile if needed.

    const pushedCount = PUSH_UNSUPPORTED.includes(conn.provider) ? 0 : Object.keys(idMappings).length;
    return { pushed: pushedCount, synced: false };
}

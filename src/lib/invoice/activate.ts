import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter, type POSProduct } from "@/lib/pos";
import { decrypt } from "@/lib/email/encryption";
import { captureError } from "@/lib/error";
import { markProductsRedispo } from "@/lib/invoice/redispo";

/**
 * Marque la facture « imported » (statut final des 3 branches d'activation). Une MAJ
 * de statut en échec ne doit pas être avalée : la facture resterait « bloquée » sans
 * signal. Non-bloquant (le catalogue est déjà poussé dans la branche POS) mais VISIBLE.
 */
async function markInvoiceImported(
    supabase: ReturnType<typeof createAdminClient>,
    invoiceId: string,
): Promise<void> {
    const { error } = await supabase
        .from("invoices")
        .update({ status: "imported", validated_at: new Date().toISOString() })
        .eq("id", invoiceId);
    if (error) {
        captureError(error, { context: "invoice-activate-status", invoiceId });
    }
}

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

    // Distinguer un échec DB (à remonter avec son contexte d'origine) d'un VRAI
    // « introuvable » : sinon l'erreur Supabase (code/hint) est perdue côté Sentry.
    if (invoiceErr) {
        captureError(invoiceErr, { context: "invoice-activate-invoice-read", invoiceId });
        throw new Error(`Failed to read invoice ${invoiceId}`);
    }
    if (!invoice) {
        throw new Error(`Invoice not found: ${invoiceId}`);
    }

    if (invoice.status !== "parsed" && invoice.status !== "validated") {
        throw new Error(`Invoice status must be 'parsed' or 'validated', got '${invoice.status}'`);
    }

    // 2. Get the PRODUCTS created by validate (not the raw invoice_items)
    //    These are already grouped by model with sizes consolidated.
    const { data: invoiceItems, error: itemsErr } = await supabase
        .from("invoice_items")
        .select("product_id")
        .eq("invoice_id", invoiceId)
        .not("product_id", "is", null);

    // Une lecture en échec ≠ « aucun produit » : ne pas la déguiser en « run validate
    // first » (faux diagnostic). On lève pour que la route remonte 500 + retry possible.
    if (itemsErr) {
        captureError(itemsErr, { context: "invoice-activate-items-read", invoiceId });
        throw new Error(`Failed to read invoice items for ${invoiceId}`);
    }

    if (!invoiceItems || invoiceItems.length === 0) {
        throw new Error("No validated products to push — run validate first");
    }

    // Get unique product IDs (multiple invoice_items point to same product after grouping)
    const productIds = [...new Set(invoiceItems.map((i) => i.product_id as string))];

    const { data: products, error: prodErr } = await supabase
        .from("products")
        .select("id, name, canonical_name, ean, price, category, photo_url, pos_item_id")
        .in("id", productIds);

    // Même classe : un échec DB ≠ « 0 produit ». On capture l'erreur d'origine.
    if (prodErr) {
        captureError(prodErr, { context: "invoice-activate-products-read", invoiceId });
        throw new Error(`Failed to read products for invoice ${invoiceId}`);
    }
    if (!products || products.length === 0) {
        throw new Error("Products not found in database");
    }

    // 3. Get merchant POS connection (optional for non-POS merchants)
    const { data: conn, error: connErr } = await supabase
        .from("pos_connections")
        .select("provider, access_token, shop_domain")
        .eq("merchant_id", invoice.merchant_id)
        .maybeSingle();

    // North-star : une lecture en échec ≠ « marchand non-POS ». Si on avalait l'erreur,
    // un blip DB ferait passer un marchand POS pour non-POS → facture marquée « imported »
    // SANS jamais pousser le catalogue → produits sans pos_item_id → plus aucun stock
    // temps réel = perte silencieuse de la propagation POS. On lève → 500 + retry.
    // L'absence VRAIE de connexion = { data: null, error: null } (distinct → branche non-POS).
    if (connErr) {
        captureError(connErr, { context: "invoice-activate-conn-read", invoiceId, merchantId: invoice.merchant_id });
        throw new Error(`Failed to read POS connection for invoice ${invoiceId}`);
    }

    // Non-POS merchants: products are already in Two-Step DB from validate.
    // Just update invoice status — no POS push needed.
    if (!conn) {
        await markInvoiceImported(supabase, invoiceId);
        await markProductsRedispo(productIds);
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
        await markInvoiceImported(supabase, invoiceId);
        await markProductsRedispo(productIds);
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
            const { error: mapErr } = await supabase
                .from("products")
                .update({ pos_item_id: posId, pos_provider: conn.provider })
                .eq("id", product.id);
            // Le push POS a DÉJÀ réussi (le produit existe dans la caisse) : NE PAS lever
            // (un re-run le re-pousserait → doublon POS). Mais perdre le mapping en silence
            // = webhooks temps réel non résolus → on le rend VISIBLE (captureError).
            if (mapErr) {
                captureError(mapErr, { context: "invoice-activate-posid-write", invoiceId, productId: product.id, posId });
            }
        }
    }

    // 7. Update invoice status
    await markInvoiceImported(supabase, invoiceId);

    await markProductsRedispo(productIds);

    // NO sync trigger — products are already in Two-Step DB from validate.
    // The next scheduled sync (every 15 min) will reconcile if needed.

    const pushedCount = PUSH_UNSUPPORTED.includes(conn.provider) ? 0 : Object.keys(idMappings).length;
    return { pushed: pushedCount, synced: false };
}

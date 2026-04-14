import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInvoice } from "@/lib/parser";
import { extractSize, stripSize } from "@/lib/pos/extract-size";
import { captureError } from "@/lib/error";
import { rateLimit } from "@/lib/rate-limit";

const ACCEPTED_TYPES = new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Import a full catalog snapshot (CSV/XLSX/XLS exported from the merchant's POS).
 * Unlike invoice import (which ADDS stock), this REPLACES stock with current values.
 * Matches existing products by EAN → name, creates new ones if not found.
 */
export async function POST(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "catalog:import", 3);
    if (limited) return limited;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();
        if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

        if (!ACCEPTED_TYPES.has(file.type)) {
            return NextResponse.json(
                { error: "Type non supporté. Formats acceptés : CSV, XLSX, XLS." },
                { status: 400 },
            );
        }
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)." }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Sanitise filename (used for parsing only, no storage path here)
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);

        // Dedup: block identical file re-import
        const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
        const { data: existingImport } = await supabase
            .from("invoices")
            .select("id")
            .eq("merchant_id", merchant.id)
            .eq("file_hash", fileHash)
            .maybeSingle();

        if (existingImport) {
            return NextResponse.json({ error: "Ce fichier a déjà été importé." }, { status: 409 });
        }

        // Parse the file
        const parsed = await parseInvoice(buffer, safeFilename);
        if (parsed.items.length === 0) {
            return NextResponse.json({ error: "Aucun produit détecté dans le fichier." }, { status: 400 });
        }

        // Record as a catalog-type invoice for traceability
        const { data: record } = await supabase
            .from("invoices")
            .insert({
                merchant_id: merchant.id,
                source: "upload",
                status: "imported",
                file_hash: fileHash,
                supplier_name: "CATALOGUE IMPORT",
                received_at: new Date().toISOString(),
                parsed_at: new Date().toISOString(),
                validated_at: new Date().toISOString(),
            })
            .select("id")
            .single();

        // Pre-fetch all existing products for this merchant
        const { data: existingProducts } = await supabase
            .from("products")
            .select("id, ean, name, sku")
            .eq("merchant_id", merchant.id);

        const byEan = new Map<string, string>();
        const byName = new Map<string, string>();
        for (const p of existingProducts ?? []) {
            if (p.ean) byEan.set(p.ean, p.id);
            if (p.name) byName.set(p.name.toLowerCase().trim(), p.id);
        }

        let productsCreated = 0;
        let productsUpdated = 0;
        let stockReplaced = 0;
        const admin = createAdminClient();

        // Group items by base name (strip size) to merge size variants
        type CatalogItem = (typeof parsed.items)[number] & { _size: string | null; _cleanName: string };
        const groups = new Map<string, CatalogItem[]>();

        for (const item of parsed.items) {
            const size = extractSize(item.name);
            const cleanName = size ? stripSize(item.name) : item.name;
            const key = cleanName.toLowerCase().trim();
            const grouped: CatalogItem = { ...item, _size: size, _cleanName: cleanName };
            const group = groups.get(key) ?? [];
            group.push(grouped);
            groups.set(key, group);
        }

        const errors: string[] = [];

        for (const [, groupItems] of groups) {
            const firstItem = groupItems[0];
            const cleanName = firstItem._cleanName;

            // Skip items with no name or negative quantity
            if (!cleanName.trim()) continue;
            const validItems = groupItems.filter((g) => g.quantity >= 0);
            if (validItems.length === 0) continue;

            // Match existing product: EAN first, then name
            let productId: string | null = null;

            // Check ALL EANs in the group for matching (not just first item)
            for (const g of validItems) {
                if (g.ean && byEan.has(g.ean)) {
                    productId = byEan.get(g.ean)!;
                    break;
                }
            }
            if (!productId && byName.has(cleanName.toLowerCase().trim())) {
                productId = byName.get(cleanName.toLowerCase().trim())!;
            }

            // Compute available sizes + total stock
            const availableSizes = validItems
                .filter((g) => g._size)
                .map((g) => ({ size: g._size!, quantity: g.quantity }));
            const totalStock = validItems.reduce((sum, g) => sum + g.quantity, 0);

            if (productId) {
                // UPDATE existing product — REPLACE stock
                const updates: Record<string, unknown> = { visible: true };
                if (firstItem.unit_price && firstItem.unit_price > 0) updates.price = firstItem.unit_price;
                if (availableSizes.length > 0) updates.available_sizes = availableSizes;

                const { error: updateErr } = await supabase.from("products").update(updates).eq("id", productId);
                if (updateErr) { errors.push(`Update ${cleanName}: ${updateErr.message}`); continue; }

                const { error: stockErr } = await supabase.from("stock").upsert(
                    { product_id: productId, quantity: totalStock, updated_at: new Date().toISOString() },
                    { onConflict: "product_id" },
                );
                if (stockErr) { errors.push(`Stock ${cleanName}: ${stockErr.message}`); continue; }

                productsUpdated++;
                stockReplaced++;
            } else {
                // CREATE new product
                const { data: created, error: rpcErr } = await admin.rpc("create_product_with_stock", {
                    p_merchant_id: merchant.id,
                    p_name: cleanName,
                    p_price: firstItem.unit_price && firstItem.unit_price > 0 ? firstItem.unit_price : null,
                    p_ean: firstItem.ean,
                    p_category: null,
                });

                if (rpcErr || !created) {
                    errors.push(`Create ${cleanName}: ${rpcErr?.message ?? "RPC returned null"}`);
                    continue;
                }

                const newId = created as string;

                // Set stock to catalog value (REPLACE, not default 0)
                await supabase.from("stock").upsert(
                    { product_id: newId, quantity: totalStock, updated_at: new Date().toISOString() },
                    { onConflict: "product_id" },
                );

                if (availableSizes.length > 0) {
                    await supabase.from("products").update({
                        available_sizes: availableSizes,
                        visible: true,
                    }).eq("id", newId);
                }

                // Feed event pour le nouveau produit
                await admin.from("feed_events").insert({
                    merchant_id: merchant.id,
                    product_id: newId,
                    event_type: "new_product",
                });

                // Track for dedup within this import
                if (firstItem.ean) byEan.set(firstItem.ean, newId);
                byName.set(cleanName.toLowerCase().trim(), newId);
                productsCreated++;
                stockReplaced++;
            }
        }

        return NextResponse.json({
            catalog_import: true,
            products_created: productsCreated,
            products_updated: productsUpdated,
            stock_replaced: stockReplaced,
            total_items_parsed: parsed.items.length,
            ...(errors.length > 0 && { errors }),
        }, { status: 201 });
    } catch (e) {
        captureError(e, { route: "catalog/import" });
        return NextResponse.json({ error: "Import failed" }, { status: 500 });
    }
}

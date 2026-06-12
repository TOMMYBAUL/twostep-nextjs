import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedInvoiceItem } from "@/lib/parser/types";
import { extractSize, stripSize } from "@/lib/pos/extract-size";
import { groupVariantsByEAN } from "@/lib/pos/sync-engine";
import { lookupEan, searchEanByName } from "@/lib/ean/lookup";
import { searchProductImage } from "@/lib/images/serper";
import { createImageJob } from "@/lib/images/jobs";
import { runCascade } from "@/lib/enrichment/cascade-engine";
import { validEanOrNull } from "@/lib/ean/validate";
import { selectProductsToZero } from "@/lib/ingest/reconcile";
import { captureError } from "@/lib/error";

export type SnapshotResult = {
    products_created: number;
    products_updated: number;
    stock_replaced: number;
    /** Produits passés à 0 par réconciliation (présents avant, absents du push). */
    stock_zeroed: number;
    /** true si la réconciliation a été annulée par le garde-fou (push partiel suspect). */
    reconcile_skipped: boolean;
    total_items: number;
    errors: string[];
};

export type SnapshotOptions = {
    /**
     * Réconcilier la décrémentation : mettre à 0 les produits déjà connus mais
     * absents de ce push (article vendu sorti de l'export). Vrai pour un push
     * "snapshot complet" (token NearSt), faux pour un import partiel.
     */
    reconcile?: boolean;
};

/**
 * Ingère un SNAPSHOT de stock (catalogue complet) pour un marchand.
 *
 * Sémantique "REPLACE" (≠ facture qui ADD) : la quantité du fichier devient la
 * quantité courante. C'est le contrat NearSt : `{code-barres, quantité, prix}`
 * poussé périodiquement, chaque push remplace l'état.
 *
 * Cette fonction est le cœur partagé entre :
 *   - l'upload manuel authentifié (`/api/catalog/import`)
 *   - le push récurrent sans session, par jeton (`/api/ingest/stock`)
 *
 * Étapes : groupage par taille → match (EAN valide > nom) → replace stock →
 * création invisible (gate cascade ≥ 0.95) → enrichissement → score → catégorisation.
 *
 * @param admin  Client service_role (bypass RLS — appelé serveur uniquement).
 */
export async function ingestStockSnapshot(
    merchantId: string,
    items: ParsedInvoiceItem[],
    admin: SupabaseClient,
    opts: SnapshotOptions = {},
): Promise<SnapshotResult> {
    const errors: string[] = [];
    const touched = new Set<string>();

    // Index des produits existants (match EAN puis nom)
    const { data: existingProducts } = await admin
        .from("products")
        .select("id, ean, name, sku")
        .eq("merchant_id", merchantId);

    const byEan = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const p of existingProducts ?? []) {
        if (p.ean) byEan.set(p.ean, p.id);
        if (p.name) byName.set(p.name.toLowerCase().trim(), p.id);
    }

    // Groupage par nom de base (taille retirée) pour fusionner les variantes
    type CatalogItem = ParsedInvoiceItem & { _size: string | null; _cleanName: string };
    const groups = new Map<string, CatalogItem[]>();
    for (const item of items) {
        const size = extractSize(item.name);
        const cleanName = size ? stripSize(item.name) : item.name;
        // EAN n'est une identité que s'il passe le checksum GTIN ; sinon c'est
        // un code interne (SKU) — on le bascule vers le champ sku.
        const validEan = validEanOrNull(item.ean);
        const normalized: CatalogItem = {
            ...item,
            ean: validEan,
            sku: item.sku ?? (item.ean && !validEan ? item.ean : null),
            _size: size,
            _cleanName: cleanName,
        };
        const key = cleanName.toLowerCase().trim();
        const group = groups.get(key) ?? [];
        group.push(normalized);
        groups.set(key, group);
    }

    let productsCreated = 0;
    let productsUpdated = 0;
    let stockReplaced = 0;

    for (const [, groupItems] of groups) {
        const firstItem = groupItems[0];
        const cleanName = firstItem._cleanName;
        if (!cleanName.trim()) continue;

        const validItems = groupItems.filter((g) => g.quantity >= 0);
        if (validItems.length === 0) continue;

        // Match : EAN (sur tout le groupe) puis nom
        let productId: string | null = null;
        for (const g of validItems) {
            if (g.ean && byEan.has(g.ean)) {
                productId = byEan.get(g.ean)!;
                break;
            }
        }
        if (!productId && byName.has(cleanName.toLowerCase().trim())) {
            productId = byName.get(cleanName.toLowerCase().trim())!;
        }

        const availableSizes = validItems
            .filter((g) => g._size)
            .map((g) => ({ size: g._size!, quantity: g.quantity }));
        const totalStock = validItems.reduce((sum, g) => sum + g.quantity, 0);

        if (productId) {
            // UPDATE — REPLACE le stock
            const updates: Record<string, unknown> = { visible: true };
            if (firstItem.unit_price && firstItem.unit_price > 0) updates.price = firstItem.unit_price;
            if (availableSizes.length > 0) updates.available_sizes = availableSizes;

            const { error: updateErr } = await admin.from("products").update(updates).eq("id", productId);
            if (updateErr) { errors.push(`Update ${cleanName}: ${updateErr.message}`); continue; }

            const { error: stockErr } = await admin.from("stock").upsert(
                { product_id: productId, quantity: totalStock, updated_at: new Date().toISOString() },
                { onConflict: "product_id" },
            );
            if (stockErr) { errors.push(`Stock ${cleanName}: ${stockErr.message}`); continue; }

            touched.add(productId);
            productsUpdated++;
            stockReplaced++;
        } else {
            // CREATE — invisible jusqu'à validation cascade ≥ 0.95
            const newId = crypto.randomUUID();
            const { error: createErr } = await admin.from("products").insert({
                id: newId,
                merchant_id: merchantId,
                name: cleanName,
                price: firstItem.unit_price && firstItem.unit_price > 0 ? firstItem.unit_price : null,
                ean: firstItem.ean || null,
                sku: firstItem.sku || null,
                visible: false,
                review_status: "pending",
            });
            if (createErr) { errors.push(`Create ${cleanName}: ${createErr.message}`); continue; }

            await admin.from("stock").upsert(
                { product_id: newId, quantity: totalStock, updated_at: new Date().toISOString() },
                { onConflict: "product_id" },
            );
            if (availableSizes.length > 0) {
                await admin.from("products").update({ available_sizes: availableSizes }).eq("id", newId);
            }
            await admin.from("feed_events").insert({
                merchant_id: merchantId,
                product_id: newId,
                event_type: "new_product",
            });

            if (firstItem.ean) byEan.set(firstItem.ean, newId);
            byName.set(cleanName.toLowerCase().trim(), newId);
            touched.add(newId);
            productsCreated++;
            stockReplaced++;
        }
    }

    // ── Réconciliation de décrémentation ──────────────────────────────────────
    // Les produits déjà en stock mais ABSENTS de ce push (article vendu, sorti de
    // l'export) doivent passer à 0. Garde-fou anti-fichier-partiel dans reconcile.ts.
    let stockZeroed = 0;
    let reconcileSkipped = false;
    if (opts.reconcile) {
        const { data: inStockRows } = await admin
            .from("stock")
            .select("product_id, quantity, products!inner(merchant_id)")
            .eq("products.merchant_id", merchantId)
            .gt("quantity", 0);

        const existingInStock = ((inStockRows ?? []) as unknown as {
            product_id: string;
            quantity: number;
        }[]).map((r) => ({ id: r.product_id, quantity: r.quantity }));

        const decision = selectProductsToZero(touched, existingInStock);
        if (decision.skipped) {
            reconcileSkipped = true;
            errors.push(`Réconciliation annulée: ${decision.reason}`);
        } else if (decision.toZero.length > 0) {
            const { error: zeroErr } = await admin
                .from("stock")
                .update({ quantity: 0, updated_at: new Date().toISOString() })
                .in("product_id", decision.toZero);
            if (zeroErr) {
                errors.push(`Réconciliation stock=0: ${zeroErr.message}`);
            } else {
                stockZeroed = decision.toZero.length;
                await admin.from("feed_events").insert(
                    decision.toZero.map((pid) => ({
                        merchant_id: merchantId,
                        product_id: pid,
                        event_type: "out_of_stock",
                    })),
                );
            }
        }
    }

    // Regroupement des variantes par EAN (même logique que le sync POS)
    try {
        await groupVariantsByEAN(admin, merchantId);
    } catch (err) {
        captureError(err, { lib: "ingest/snapshot", phase: "group-variants", merchantId });
    }

    // Enrichissement des nouveaux produits (cascade 6 tiers + score + visibilité)
    const { data: newProducts } = await admin
        .from("products")
        .select("id, ean, sku, name, brand, photo_url")
        .eq("merchant_id", merchantId)
        .is("photo_url", null);

    for (const product of newProducts ?? []) {
        try {
            if (product.ean) {
                await lookupEan(product.ean, product.id);
            } else {
                let foundEan: string | null = null;
                if (product.sku) {
                    const { data: skuMatch } = await admin
                        .from("products")
                        .select("ean")
                        .eq("sku", product.sku)
                        .not("ean", "is", null)
                        .neq("id", product.id)
                        .limit(1)
                        .single();
                    if (skuMatch?.ean) foundEan = skuMatch.ean;
                }
                if (!foundEan) {
                    const found = await searchEanByName(product.name, product.brand);
                    if (found) foundEan = found.ean;
                }
                if (foundEan) {
                    await admin.from("products").update({ ean: foundEan }).eq("id", product.id);
                    await lookupEan(foundEan, product.id);
                } else {
                    const photoUrl = await searchProductImage(product.name, product.brand, null, product.sku);
                    if (photoUrl) {
                        await admin
                            .from("products")
                            .update({ photo_url: photoUrl, photo_processed_url: null, photo_source: "serper" })
                            .eq("id", product.id);
                        await createImageJob(product.id, merchantId, photoUrl);
                    }
                }
            }

            const { data: refreshed } = await admin
                .from("products")
                .select("ean, name, brand, sku")
                .eq("id", product.id)
                .single();
            if (!refreshed) continue;

            const outcome = await runCascade({
                ean: refreshed.ean,
                name: refreshed.name,
                brand: refreshed.brand,
                sku: refreshed.sku,
            });

            await admin.from("products").update({
                identification_score: outcome.score,
                identification_tiers: outcome.tiers_matched,
                visible: outcome.visible,
                review_status: outcome.review_status,
            }).eq("id", product.id);
        } catch (err) {
            captureError(err, { lib: "ingest/snapshot", phase: "enrichment", productId: product.id });
        }
    }

    // Catégorisation IA
    if (productsCreated > 0 || productsUpdated > 0) {
        try {
            const { categorizeMerchantProducts } = await import("@/lib/ai/categorize");
            await categorizeMerchantProducts(merchantId);
        } catch (err) {
            captureError(err, { lib: "ingest/snapshot", phase: "categorize", merchantId });
        }
    }

    return {
        products_created: productsCreated,
        products_updated: productsUpdated,
        stock_replaced: stockReplaced,
        stock_zeroed: stockZeroed,
        reconcile_skipped: reconcileSkipped,
        total_items: items.length,
        errors,
    };
}

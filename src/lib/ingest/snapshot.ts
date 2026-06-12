import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedInvoiceItem } from "@/lib/parser/types";
import { extractSize, stripSize } from "@/lib/pos/extract-size";
import { groupVariantsByEAN } from "@/lib/pos/sync-engine";
import { lookupEan, searchEanByName } from "@/lib/ean/lookup";
import { searchProductImage } from "@/lib/images/serper";
import { createImageJob } from "@/lib/images/jobs";
import { runCascade } from "@/lib/enrichment/cascade-engine";
import { SCORE_THRESHOLDS } from "@/lib/enrichment/score-cascade";
import { selectProductsToZero } from "@/lib/ingest/reconcile";
import { triageStockItems, isPlaceholderName, type TriageReport } from "@/lib/ingest/triage";
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
    /** Rapport de triage d'identité (règle GTIN/SKU — rejets comptés, jamais silencieux). */
    triage: Omit<TriageReport, "accepted">;
    /** true si exécution en simulation (preview wizard) — AUCUNE écriture effectuée. */
    dry_run: boolean;
};

export type SnapshotOptions = {
    /**
     * Réconcilier la décrémentation : mettre à 0 les produits déjà connus mais
     * absents de ce push (article vendu sorti de l'export). Vrai pour un push
     * "snapshot complet" (token NearSt), faux pour un import partiel.
     */
    reconcile?: boolean;
    /**
     * Simulation pour le wizard d'import : calcule tout (matching, triage,
     * décision de réconciliation) mais n'écrit RIEN et ne lance pas
     * l'enrichissement. Le marchand confirme, puis on rappelle sans dryRun.
     */
    dryRun?: boolean;
};

/**
 * Ingère un SNAPSHOT de stock (catalogue complet) pour un marchand.
 *
 * Sémantique "REPLACE" (≠ facture qui ADD) : la quantité du fichier devient la
 * quantité courante. C'est le contrat NearSt : `{code-barres, quantité, prix}`
 * poussé périodiquement, chaque push remplace l'état.
 *
 * Cette fonction est le cœur partagé entre :
 *   - l'upload manuel authentifié (`/api/catalog/import`, modes preview/apply)
 *   - le push récurrent sans session, par jeton (`/api/ingest/stock`)
 *
 * Étapes : triage d'identité (GTIN/SKU, nom seul rejeté) → groupage par taille →
 * match (EAN > SKU > nom) → replace stock → réconciliation gardée → création
 * invisible (gate cascade ≥ 0.95) → enrichissement (identité devinée = jamais
 * auto-publiée) → score → catégorisation. En dryRun : simulation sans écriture.
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
    const dryRun = opts.dryRun === true;

    // Règle d'identité : GTIN valide ou SKU exploitable, sinon rejet compté.
    // Le nom seul n'est JAMAIS une identité d'ingestion.
    const { accepted, ...triageSummary } = triageStockItems(items);

    // Index des produits existants (match EAN > SKU > nom)
    const { data: existingProducts } = await admin
        .from("products")
        .select("id, ean, name, sku")
        .eq("merchant_id", merchantId);

    const byEan = new Map<string, string>();
    const bySku = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const p of existingProducts ?? []) {
        if (p.ean) byEan.set(p.ean, p.id);
        if (p.sku) bySku.set(p.sku.toLowerCase(), p.id);
        if (p.name) byName.set(p.name.toLowerCase().trim(), p.id);
    }

    // Groupage par nom de base (taille retirée) pour fusionner les variantes
    type CatalogItem = ParsedInvoiceItem & { _size: string | null; _cleanName: string };
    const groups = new Map<string, CatalogItem[]>();
    for (const item of accepted) {
        const size = extractSize(item.name);
        const cleanName = size ? stripSize(item.name) : item.name;
        const normalized: CatalogItem = { ...item, _size: size, _cleanName: cleanName };
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

        // Match : EAN (sur tout le groupe), puis SKU, puis nom (le nom n'est
        // qu'une aide au dédoublonnage de l'existant — jamais une identité).
        let productId: string | null = null;
        for (const g of validItems) {
            if (g.ean && byEan.has(g.ean)) {
                productId = byEan.get(g.ean)!;
                break;
            }
        }
        if (!productId) {
            for (const g of validItems) {
                if (g.sku && bySku.has(g.sku.toLowerCase())) {
                    productId = bySku.get(g.sku.toLowerCase())!;
                    break;
                }
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
            // UPDATE — REPLACE le stock. On ne touche PAS à `visible` : la
            // visibilité est gouvernée par le gate cascade/validation, et un
            // push de stock ne doit jamais ressusciter un produit masqué
            // (soft-delete marchand, score < 0,95, signalements...).
            if (!dryRun) {
                const updates: Record<string, unknown> = {};
                if (firstItem.unit_price && firstItem.unit_price > 0) updates.price = firstItem.unit_price;
                if (availableSizes.length > 0) updates.available_sizes = availableSizes;

                if (Object.keys(updates).length > 0) {
                    const { error: updateErr } = await admin.from("products").update(updates).eq("id", productId);
                    if (updateErr) { errors.push(`Update ${cleanName}: ${updateErr.message}`); continue; }
                }

                const { error: stockErr } = await admin.from("stock").upsert(
                    { product_id: productId, quantity: totalStock, updated_at: new Date().toISOString() },
                    { onConflict: "product_id" },
                );
                if (stockErr) { errors.push(`Stock ${cleanName}: ${stockErr.message}`); continue; }
            }

            touched.add(productId);
            productsUpdated++;
            stockReplaced++;
        } else {
            // CREATE — invisible jusqu'à validation cascade ≥ 0.95
            const newId = crypto.randomUUID();
            if (!dryRun) {
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
            }

            if (firstItem.ean) byEan.set(firstItem.ean, newId);
            if (firstItem.sku) bySku.set(firstItem.sku.toLowerCase(), newId);
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
    // Jamais de réconciliation depuis un push sans AUCUNE ligne exploitable :
    // sur un petit catalogue (< minCatalogForGuard), le garde-fou de couverture
    // ne s'applique pas et un fichier illisible viderait toute la boutique.
    if (opts.reconcile && accepted.length === 0) {
        reconcileSkipped = true;
        errors.push("Réconciliation annulée: aucune ligne exploitable dans le push");
    }
    if (opts.reconcile && accepted.length > 0) {
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
            if (dryRun) {
                // Preview : on annonce combien de produits PASSERAIENT à 0.
                stockZeroed = decision.toZero.length;
            } else {
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
    }

    // ── Simulation (preview wizard) : on s'arrête ici, rien n'a été écrit ─────
    if (dryRun) {
        return {
            products_created: productsCreated,
            products_updated: productsUpdated,
            stock_replaced: stockReplaced,
            stock_zeroed: stockZeroed,
            reconcile_skipped: reconcileSkipped,
            total_items: items.length,
            errors,
            triage: triageSummary,
            dry_run: true,
        };
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
        .select("id, ean, sku, name, brand, photo_url, review_status")
        .eq("merchant_id", merchantId)
        .is("photo_url", null);

    for (const product of newProducts ?? []) {
        try {
            // Un produit VALIDÉ (par le marchand ou un score ≥ 0,95 antérieur) a
            // une identité tranchée : on ne la re-devine ni ne la re-score JAMAIS
            // — un push de stock ne doit pas pouvoir dépublier un produit validé.
            const isValidated = product.review_status === "validated";

            // Un EAN non déclaré dans le fichier mais RETROUVÉ (par SKU partagé ou
            // recherche par nom) est une identité DEVINÉE : elle n'auto-publie
            // jamais, elle alimente la file de validation 1-tap du marchand.
            let eanGuessed = false;

            if (product.ean) {
                await lookupEan(product.ean, product.id);
            } else if (!isValidated) {
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
                // Pas de recherche par nom sur un placeholder ("REF X" / "EAN X") :
                // ça ne peut produire que du bruit, donc de fausses identités.
                if (!foundEan && !isPlaceholderName(product.name)) {
                    const found = await searchEanByName(product.name, product.brand);
                    if (found) foundEan = found.ean;
                }
                if (foundEan) {
                    eanGuessed = true;
                    await admin.from("products").update({ ean: foundEan }).eq("id", product.id);
                    await lookupEan(foundEan, product.id);
                } else if (!isPlaceholderName(product.name)) {
                    const photoUrl = await searchProductImage(product.name, product.brand, null, product.sku);
                    if (photoUrl) {
                        await admin
                            .from("products")
                            .update({ photo_url: photoUrl, photo_processed_url: null, photo_source: "serper" })
                            .eq("id", product.id);
                        await createImageJob(product.id, merchantId, photoUrl);
                    }
                }
            } else if (!isPlaceholderName(product.name)) {
                // Validé sans EAN : on complète au mieux la photo, rien d'autre.
                const photoUrl = await searchProductImage(product.name, product.brand, null, product.sku);
                if (photoUrl) {
                    await admin
                        .from("products")
                        .update({ photo_url: photoUrl, photo_processed_url: null, photo_source: "serper" })
                        .eq("id", product.id);
                    await createImageJob(product.id, merchantId, photoUrl);
                }
            }

            // Identité tranchée → pas de re-scoring, pas de changement de visibilité.
            if (isValidated) continue;

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

            // Identité devinée → plafonnée à la file 1-tap, jamais visible seule.
            const visible = eanGuessed ? false : outcome.visible;
            const reviewStatus = eanGuessed
                ? (outcome.score >= SCORE_THRESHOLDS.review_queue ? "pending" : "masked")
                : outcome.review_status;

            await admin.from("products").update({
                identification_score: outcome.score,
                identification_tiers: outcome.tiers_matched,
                visible,
                review_status: reviewStatus,
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
        triage: triageSummary,
        dry_run: false,
    };
}

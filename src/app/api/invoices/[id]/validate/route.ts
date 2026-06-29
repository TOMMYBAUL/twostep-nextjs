import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchEanData } from "@/lib/ean/lookup";
import { mapEanCategoryToFr } from "@/lib/ean/category";
import { categorizeMerchantProducts } from "@/lib/ai/categorize";
import { extractSize, stripSize } from "@/lib/pos/extract-size";
import { groupVariantsByEAN } from "@/lib/pos/sync-engine";
import { rateLimit } from "@/lib/rate-limit";
import { captureError } from "@/lib/error";

// ── Fuzzy matching utilities ──────────────────────────────────────────

/** Remove special chars, collapse whitespace, lowercase */
function normalize(s: string): string {
    return s
        .toLowerCase()
        .replace(/[''`\-/().,"]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Levenshtein distance between two strings */
function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
            const tmp = dp[j];
            dp[j] = a[i - 1] === b[j - 1]
                ? prev
                : 1 + Math.min(prev, dp[j], dp[j - 1]);
            prev = tmp;
        }
    }
    return dp[n];
}

/** Similarity ratio 0..1 based on Levenshtein distance */
function similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshtein(a, b) / maxLen;
}

const FUZZY_THRESHOLD = 0.7; // Raised — precision matters more than recall

type MatchResult = {
    productId: string;
    matchType: "exact_ean" | "exact_sku" | "exact_name" | "fuzzy";
};

// ── Route handler ────────────────────────────────────────────────────

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "invoices:validate", 10);
    if (limited) return limited;

    const { id } = await params;

    if (!id || typeof id !== "string") {
        return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
    }

    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "No merchant" }, { status: 404 });

    const { data: invoice } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .eq("id", id)
        .eq("merchant_id", merchant.id)
        .single();

    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoice.status === "imported") {
        return NextResponse.json({ error: "Already imported" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (body.selling_prices !== undefined && (typeof body.selling_prices !== "object" || Array.isArray(body.selling_prices))) {
        return NextResponse.json({ error: "selling_prices must be an object" }, { status: 400 });
    }

    const sellingPrices: Record<string, number> = (body.selling_prices as Record<string, number>) ?? {};

    let productsCreated = 0;
    let productsUpdated = 0;
    let stockUpdated = 0;
    let fuzzyMatched = 0;
    // Compteur d'échecs RENDUS VISIBLES (north-star « ne rien perdre silencieusement ») :
    // une facture = marchandise REÇUE ; un produit/stock qu'on n'arrive pas à écrire ne
    // doit JAMAIS disparaître en silence derrière un statut « validée ». On accumule, on
    // remonte à Sentry, et on l'expose dans la réponse (le marchand voit que tout n'est
    // pas passé). Pas de throw : les écritures déjà faites dans le batch restent valides
    // et un re-validate re-converge (le produit manquant sera créé/matché au prochain run).
    const errors: string[] = [];
    const productsToEnrich: { ean: string | null; sku: string | null; productId: string }[] = [];

    const validItems = invoice.invoice_items.filter(
        (item: { status: string }) => item.status !== "rejected"
    );

    if (process.env.NODE_ENV === "development") {
        console.log("[validate] validItems count:", validItems.length, "items:", validItems.map((i: any) => i.name));
    }

    // ── Pre-load ALL merchant products once (avoid N+1 queries) ──────────
    // Uses the unified matching helpers from src/lib/enrichment/match-product.ts.
    const { buildProductIndex, matchProduct } = await import("@/lib/enrichment/match-product");
    const productIndex = await buildProductIndex(merchant.id, "id, name, ean, sku");

    // ── Pre-group items by base product name (strip size) ──
    // "Nike Dunk Low taille 42" + "Nike Dunk Low taille 43" → same group
    // This prevents creating duplicate products for each size variant.
    type GroupedItem = typeof validItems[number] & { _size: string | null; _cleanName: string };
    const itemGroups = new Map<string, GroupedItem[]>();

    for (const item of validItems) {
        const size = extractSize(item.name);
        const cleanName = size ? stripSize(item.name) : item.name;
        const key = normalize(cleanName);
        const grouped: GroupedItem = { ...item, _size: size, _cleanName: cleanName };
        const group = itemGroups.get(key) ?? [];
        group.push(grouped);
        itemGroups.set(key, group);
    }

    // Track products created within this validation to avoid re-creating
    // when multiple sizes of a new product appear in the same invoice
    const createdInThisBatch = new Map<string, string>(); // normalizedName → productId

    if (process.env.NODE_ENV === "development") {
        console.log("[validate] groups:", itemGroups.size, [...itemGroups.keys()]);
    }

    for (const [groupKey, groupItems] of itemGroups) {
    // Use the first item for matching, but collect all sizes
    const item = groupItems[0];
    const allSizes = [...new Set(groupItems.map(g => g._size).filter(Boolean))] as string[];
    const cleanName = item._cleanName;
        // 4-strategy cascade extracted into matchProduct: exact_ean → exact_sku → exact_name → fuzzy.
        // Fuzzy matches still require human review (handled below at L228).
        const helperMatch = matchProduct(
            { ean: item.ean, sku: item.sku, name: item.name },
            productIndex,
            { fuzzyThreshold: FUZZY_THRESHOLD },
        );
        const match: MatchResult | null = helperMatch && helperMatch.matchType !== "pos_item_id"
            ? { productId: helperMatch.productId, matchType: helperMatch.matchType }
            : null;

        const sellingPrice = sellingPrices[item.id] ?? null;
        const firstEan = groupItems.find(g => g.ean)?.ean ?? null;
        const firstSku = groupItems.find(g => g.sku)?.sku ?? null;

        if (match) {
            // Fuzzy matches require human review — don't auto-update stock
            if (match.matchType === "fuzzy") {
                for (const gi of groupItems) {
                    await supabase
                        .from("invoice_items")
                        .update({
                            product_id: match.productId,
                            status: "pending_review",
                            match_type: "fuzzy",
                        })
                        .eq("id", gi.id);
                }
                fuzzyMatched++;
                continue;
            }

            // Exact matches — update product with facture data
            const updateFields: Record<string, unknown> = {
                purchase_price: item.unit_price_ht,
                canonical_name: cleanName,
                ...(sellingPrice && { price: sellingPrice }),
                ...(firstEan && { ean: firstEan }),
            };

            // Merge all sizes from this group into available_sizes.
            // MÊME CLASSE que la lecture stock : si la lecture des tailles existantes échoue,
            // `data=null` était indistinct de « aucune taille » → le merge ÉCRASAIT les tailles
            // réelles par la seule liste de cette facture (perte de tailles silencieuse). On
            // distingue erreur de vide : sur erreur, on REMONTE et on N'ÉCRIT PAS available_sizes
            // (préservation) ; le re-validate re-fusionnera.
            if (allSizes.length > 0) {
                const { data: existingProduct, error: sizesReadErr } = await supabase
                    .from("products")
                    .select("available_sizes")
                    .eq("id", match.productId)
                    .single();

                if (sizesReadErr) {
                    errors.push(`Sizes read ${cleanName}: ${sizesReadErr.message}`);
                    captureError(sizesReadErr, { context: "invoices-validate-sizes-read", merchantId: merchant.id, productId: match.productId });
                } else {
                    const existingSizes: { size: string; quantity: number }[] = existingProduct?.available_sizes ?? [];
                    // Merge sizes as {size, quantity} objects (not raw strings)
                    const sizeMap = new Map(existingSizes.map((s: any) => [typeof s === "string" ? s : s.size, typeof s === "object" ? s.quantity : 0]));
                    for (const gi of groupItems) {
                        if (gi._size) {
                            sizeMap.set(gi._size, (sizeMap.get(gi._size) ?? 0) + gi.quantity);
                        }
                    }
                    updateFields.available_sizes = Array.from(sizeMap.entries()).map(([size, quantity]) => ({ size, quantity }));
                }
            }

            await adminSupabase.from("products").update(updateFields).eq("id", match.productId);

            // Add stock directly (invoice = goods received).
            // read-modify-write : on LIT la qté courante pour AJOUTER la marchandise reçue.
            // Si la lecture échoue (blip DB), `data=null` était indistinct de « pas de stock »
            // → l'upsert ÉCRASAIT la qté réelle existante par la seule qté facture = perte
            // silencieuse de stock. On distingue donc erreur de vide : sur erreur, on REMONTE
            // (captureError) et on N'ÉCRASE PAS (skip de l'upsert) ; le re-validate ré-ajoutera.
            const matchTotalQty = groupItems.reduce((sum, gi) => sum + gi.quantity, 0);
            const { data: currentStock, error: currentStockErr } = await adminSupabase
                .from("stock")
                .select("quantity")
                .eq("product_id", match.productId)
                .maybeSingle();
            if (currentStockErr) {
                errors.push(`Stock read ${cleanName}: ${currentStockErr.message}`);
                captureError(currentStockErr, { context: "invoices-validate-stock-read", merchantId: merchant.id, productId: match.productId });
            } else {
                const { error: stockUpsertErr } = await adminSupabase.from("stock").upsert({
                    product_id: match.productId,
                    quantity: (currentStock?.quantity ?? 0) + matchTotalQty,
                    source: "invoice",
                    source_ts: new Date().toISOString(),
                });
                if (stockUpsertErr) {
                    errors.push(`Stock ${cleanName}: ${stockUpsertErr.message}`);
                    captureError(stockUpsertErr, { context: "invoices-validate-stock-upsert", merchantId: merchant.id, productId: match.productId });
                } else {
                    stockUpdated += groupItems.length;
                }
            }

            for (const gi of groupItems) {
                await adminSupabase
                    .from("invoice_items")
                    .update({
                        product_id: match.productId,
                        status: "validated",
                        match_type: match.matchType,
                    })
                    .eq("id", gi.id);
            }

            productsUpdated++;

            // Feed event for restock
            await adminSupabase.from("feed_events").insert({
                merchant_id: merchant.id,
                product_id: match.productId,
                event_type: "restock",
            });

            // Enrich matched product if missing photo
            const { data: existingProd } = await adminSupabase
                .from("products")
                .select("name, photo_url")
                .eq("id", match.productId)
                .single();

            if (existingProd && !existingProd.photo_url) {
                productsToEnrich.push({ ean: firstEan, sku: firstSku, productId: match.productId });
            }
        } else {
            if (process.env.NODE_ENV === "development") {
                console.log("[validate] NEW PRODUCT for group:", groupKey, "cleanName:", cleanName, "sizes:", allSizes);
            }
            // ── NEW PRODUCT ──
            // Check if we already created this product in this batch
            // (another group with slightly different name might have matched)
            const existingBatchId = createdInThisBatch.get(groupKey);
            if (existingBatchId) {
                // Just add sizes and stock to the already-created product.
                // Lecture des tailles existantes : même garde anti-écrasement que ci-dessus.
                if (allSizes.length > 0) {
                    const { data: p, error: pErr } = await supabase
                        .from("products").select("available_sizes").eq("id", existingBatchId).single();
                    if (pErr) {
                        errors.push(`Sizes read ${cleanName}: ${pErr.message}`);
                        captureError(pErr, { context: "invoices-validate-sizes-read", merchantId: merchant.id, productId: existingBatchId });
                    } else {
                        const merged = [...new Set([...(p?.available_sizes ?? []), ...allSizes])];
                        await adminSupabase.from("products").update({ available_sizes: merged }).eq("id", existingBatchId);
                    }
                }
                // stock_incoming = marchandise reçue en attente : un insert échoué qui était
                // avalé + compté (stockUpdated++) = faux succès. On compte par succès réel.
                let incomingOk = 0;
                for (const gi of groupItems) {
                    const { error: incErr } = await adminSupabase.from("stock_incoming").insert({
                        product_id: existingBatchId, quantity: gi.quantity, invoice_id: id, status: "incoming",
                    });
                    if (incErr) {
                        errors.push(`Stock incoming ${cleanName}: ${incErr.message}`);
                        captureError(incErr, { context: "invoices-validate-stock-incoming", merchantId: merchant.id, productId: existingBatchId });
                    } else {
                        incomingOk++;
                    }
                    await adminSupabase.from("invoice_items").update({ product_id: existingBatchId, status: "validated" }).eq("id", gi.id);
                }
                stockUpdated += incomingOk;
                continue;
            }

            // Enrich before inserting — use brand from CSV as default
            let enrichedName = cleanName;
            let enrichedBrand: string | null = (item as any).brand ?? null;
            let enrichedCategory: string | null = null;

            if (firstEan) {
                try {
                    const eanData = await fetchEanData(firstEan);
                    if (eanData) {
                        if (eanData.name && eanData.name !== "Unknown") enrichedName = eanData.name;
                        enrichedBrand = eanData.brand;
                        // Twin write-path of applyEnrichment (maillon 9 (d)): the EAN source
                        // category is raw English ("clothing and fashion"…). Translate it to a
                        // French L1 slug here too, else invoice-created products would show English
                        // labels while EAN-enriched ones show French — the same field, inconsistent.
                        enrichedCategory = mapEanCategoryToFr(eanData.category);
                    }
                } catch (err) {
                    console.error("[validate] EAN pre-enrichment failed:", err);
                }
            }

            const { data: newProduct, error: insertErr } = await adminSupabase
                .from("products")
                .insert({
                    merchant_id: merchant.id,
                    name: cleanName,
                    canonical_name: enrichedName !== cleanName ? enrichedName : null,
                    ean: firstEan,
                    ...(firstSku && { sku: firstSku }),
                    price: sellingPrice,
                    purchase_price: item.unit_price_ht,
                    ...(enrichedBrand && { brand: enrichedBrand }),
                    ...(enrichedCategory && { category: enrichedCategory }),
                    ...(allSizes.length > 0 && { available_sizes: groupItems.filter(gi => gi._size).map(gi => ({ size: gi._size!, quantity: gi.quantity })) }),
                })
                .select()
                .single();

            if (process.env.NODE_ENV === "development") {
                console.log("[validate] insert result:", newProduct ? "OK id=" + newProduct.id : "FAILED", "insertErr:", insertErr?.message, "cleanName:", cleanName);
            }
            if (newProduct) {
                createdInThisBatch.set(groupKey, newProduct.id);

                // Stock = total quantity from all sizes in this group.
                // SYMÉTRIE avec ingest/snapshot : un produit créé dont l'insert stock échoue
                // resterait SANS ligne stock → lu « 0 » en aval = perte silencieuse de la qté.
                // On rend l'échec visible (erreurs + Sentry) sans throw (le produit existe ;
                // le prochain validate le matchera en UPDATE et ré-écrira le stock).
                const totalQty = groupItems.reduce((sum, gi) => sum + gi.quantity, 0);
                const { error: newStockErr } = await adminSupabase.from("stock").insert({ product_id: newProduct.id, quantity: totalQty, source: "invoice", source_ts: new Date().toISOString() });
                if (newStockErr) {
                    errors.push(`Stock (création) ${cleanName}: ${newStockErr.message}`);
                    captureError(newStockErr, { context: "invoices-validate-create-stock", merchantId: merchant.id, productId: newProduct.id });
                } else {
                    stockUpdated += groupItems.length;
                }

                // Update each invoice item
                for (const gi of groupItems) {
                    await adminSupabase.from("invoice_items").update({ product_id: newProduct.id, status: "validated" }).eq("id", gi.id);
                }

                // Create feed event so product appears in consumer discover feed
                await adminSupabase.from("feed_events").insert({
                    merchant_id: merchant.id,
                    product_id: newProduct.id,
                    event_type: "new_product",
                });

                productsCreated++;

                // Collect products for post-response enrichment
                productsToEnrich.push({ ean: firstEan, sku: firstSku, productId: newProduct.id });
            } else {
                // insertErr était destructuré mais JAMAIS remonté (console.log dev only) :
                // un produit de facture (marchandise reçue) qui échoue à l'insert disparaissait
                // en SILENCE — 0 stock, 0 invoice_item lié, 0 compteur, facture quand même
                // marquée « validée ». On le rend VISIBLE (erreurs + Sentry). Pas de throw : on
                // ne perd pas les produits déjà écrits dans le batch ; le re-validate re-tente.
                errors.push(`Create ${cleanName}: ${insertErr?.message ?? "insert returned no row"}`);
                captureError(insertErr ?? new Error(`Product insert returned no row: ${cleanName}`), { context: "invoices-validate-create-product", merchantId: merchant.id });
            }
        }
    }

    // Si cette MAJ échoue en silence, la réponse 200 dit « validée » mais la facture
    // reste à son ancien statut en base → état UI périmé ET le re-validate ne sera pas
    // déclenché correctement. On rend l'échec visible (Sentry + errors).
    const { error: statusErr } = await adminSupabase
        .from("invoices")
        .update({ status: "validated", validated_at: new Date().toISOString() })
        .eq("id", id);
    if (statusErr) {
        errors.push(`Invoice status: ${statusErr.message}`);
        captureError(statusErr, { context: "invoices-validate-status", invoiceId: id, merchantId: merchant.id });
    }

    // Enrichment cascade — orchestrated by the unified resolveAndEnrich module.
    // Cascade: EAN → SKU match → reverse search → Serper photo fallback.
    const { resolveAndEnrich } = await import("@/lib/enrichment/resolve-ean");
    for (const { ean, sku, productId } of productsToEnrich) {
        await resolveAndEnrich({ productId, ean, sku, merchantId: merchant.id });
    }

    // AI categorization — synchronous (must complete before response)
    if (productsCreated > 0 || productsUpdated > 0) {
        try {
            await categorizeMerchantProducts(merchant.id);
        } catch (err) {
            console.error("[validate] categorize failed:", err);
        }
    }

    // Group variants by EAN (invoice imports don't go through sync-engine).
    // groupVariantsByEAN est le GATE de visibilité et LÈVE désormais sur tout échec
    // d'écriture (doublon fantôme / produit non publié / stock principal périmé) → on
    // REMONTE à Sentry (pas juste console) pour que la défaillance du gate soit visible
    // en prod. Non bloquant : le stock facture est déjà committé, le regroupage re-converge.
    try {
        await groupVariantsByEAN(adminSupabase, merchant.id);
    } catch (err) {
        console.error("[validate] groupVariantsByEAN failed:", err);
        captureError(err, { context: "invoices-validate-group-variants", merchantId: merchant.id });
    }

    // Un échec d'écriture survenu en cours de batch est RENDU VISIBLE (déjà remonté à
    // Sentry plus haut) : on le signale au marchand plutôt que de présenter un succès
    // total trompeur derrière le statut « validée ».
    if (errors.length > 0) {
        captureError(new Error(`Invoice validate partial: ${errors.length} write error(s)`), {
            context: "invoices-validate-partial",
            invoiceId: id,
            merchantId: merchant.id,
            errors: errors.slice(0, 20),
        });
    }

    return NextResponse.json({
        products_created: productsCreated,
        products_updated: productsUpdated,
        stock_updated: stockUpdated,
        pending_review: fuzzyMatched,
        ...(errors.length > 0 && { errors }),
    });
    } catch (err) {
        // Le catch global avalait l'erreur (500 sans trace) → tout crash inattendu de ce
        // hot path (écriture produit/stock d'une facture) était INVISIBLE en prod. Remonté.
        captureError(err, { context: "invoices-validate" });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

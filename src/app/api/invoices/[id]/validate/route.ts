import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchEanData, lookupEan } from "@/lib/ean/lookup";
import { categorizeMerchantProducts } from "@/lib/ai/categorize";
import { extractSize, stripSize } from "@/lib/pos/extract-size";
import { groupVariantsByEAN } from "@/lib/pos/sync-engine";
import { rateLimit } from "@/lib/rate-limit";

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
    const productsToEnrich: { ean: string | null; productId: string }[] = [];

    const validItems = invoice.invoice_items.filter(
        (item: { status: string }) => item.status !== "rejected"
    );

    if (process.env.NODE_ENV === "development") {
        console.log("[validate] validItems count:", validItems.length, "items:", validItems.map((i: any) => i.name));
    }

    // ── Pre-load ALL merchant products once (avoid N+1 queries) ──────────
    const { data: allMerchantProducts } = await adminSupabase
        .from("products")
        .select("id, name, ean, sku")
        .eq("merchant_id", merchant.id);

    const productsByEan = new Map<string, string>(); // ean → id
    const productsBySku = new Map<string, string>(); // sku → id
    const productsByName = new Map<string, string>(); // normalized name → id

    for (const p of allMerchantProducts ?? []) {
        if (p.ean) productsByEan.set(p.ean, p.id);
        if (p.sku) productsBySku.set(p.sku, p.id);
        if (p.name) productsByName.set(normalize(p.name.toLowerCase()), p.id);
    }

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
        let match: MatchResult | null = null;

        // 1) Exact EAN match — Map lookup (O(1), no DB query)
        if (item.ean && productsByEan.has(item.ean)) {
            match = { productId: productsByEan.get(item.ean)!, matchType: "exact_ean" };
        }

        // 2) Exact SKU match — Map lookup
        if (!match && item.sku && productsBySku.has(item.sku)) {
            match = { productId: productsBySku.get(item.sku)!, matchType: "exact_sku" };
        }

        // 3) Exact name match (case-insensitive) — Map lookup
        if (!match) {
            const normalizedItemName = normalize(item.name.toLowerCase());
            if (productsByName.has(normalizedItemName)) {
                match = { productId: productsByName.get(normalizedItemName)!, matchType: "exact_name" };
            }
        }

        // 4) Fuzzy name match — NEVER auto-validates, always requires human review
        // Uses the pre-loaded allMerchantProducts (no extra DB query)
        if (!match && allMerchantProducts && allMerchantProducts.length > 0) {
            const normalizedItem = normalize(item.name);
            let bestId: string | null = null;
            let bestScore = 0;

            for (const product of allMerchantProducts) {
                const normalizedProduct = normalize(product.name);

                // Check containment (one name contains the other)
                if (
                    normalizedItem.includes(normalizedProduct) ||
                    normalizedProduct.includes(normalizedItem)
                ) {
                    const score = Math.min(normalizedItem.length, normalizedProduct.length) /
                        Math.max(normalizedItem.length, normalizedProduct.length);
                    if (score > bestScore) {
                        bestScore = score;
                        bestId = product.id;
                    }
                    continue;
                }

                // Levenshtein similarity
                const score = similarity(normalizedItem, normalizedProduct);
                if (score > bestScore) {
                    bestScore = score;
                    bestId = product.id;
                }
            }

            if (bestId && bestScore >= FUZZY_THRESHOLD) {
                match = { productId: bestId, matchType: "fuzzy" };
            }
        }

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

            // Merge all sizes from this group into available_sizes
            if (allSizes.length > 0) {
                const { data: existingProduct } = await supabase
                    .from("products")
                    .select("available_sizes")
                    .eq("id", match.productId)
                    .single();

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

            await adminSupabase.from("products").update(updateFields).eq("id", match.productId);

            // Add stock directly (invoice = goods received)
            const matchTotalQty = groupItems.reduce((sum, gi) => sum + gi.quantity, 0);
            const { data: currentStock } = await adminSupabase
                .from("stock")
                .select("quantity")
                .eq("product_id", match.productId)
                .maybeSingle();
            await adminSupabase.from("stock").upsert({
                product_id: match.productId,
                quantity: (currentStock?.quantity ?? 0) + matchTotalQty,
            });

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
            stockUpdated += groupItems.length;

            // Feed event for restock
            await adminSupabase.from("feed_events").insert({
                merchant_id: merchant.id,
                product_id: match.productId,
                event_type: "restock",
            });

            // Enrich if missing photo
            // Enrich matched product if missing photo
            if (firstEan) {
                const { data: existingProd } = await adminSupabase
                    .from("products")
                    .select("name, photo_url")
                    .eq("id", match.productId)
                    .single();

                if (existingProd && !existingProd.photo_url) {
                    productsToEnrich.push({ ean: firstEan, productId: match.productId });
                }
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
                // Just add sizes and stock to the already-created product
                if (allSizes.length > 0) {
                    const { data: p } = await supabase
                        .from("products").select("available_sizes").eq("id", existingBatchId).single();
                    const merged = [...new Set([...(p?.available_sizes ?? []), ...allSizes])];
                    await adminSupabase.from("products").update({ available_sizes: merged }).eq("id", existingBatchId);
                }
                for (const gi of groupItems) {
                    await adminSupabase.from("stock_incoming").insert({
                        product_id: existingBatchId, quantity: gi.quantity, invoice_id: id, status: "incoming",
                    });
                    await adminSupabase.from("invoice_items").update({ product_id: existingBatchId, status: "validated" }).eq("id", gi.id);
                }
                stockUpdated += groupItems.length;
                continue;
            }

            // Enrich before inserting
            let enrichedName = cleanName;
            let enrichedBrand: string | null = null;
            let enrichedCategory: string | null = null;

            if (firstEan) {
                try {
                    const eanData = await fetchEanData(firstEan);
                    if (eanData) {
                        if (eanData.name && eanData.name !== "Unknown") enrichedName = eanData.name;
                        enrichedBrand = eanData.brand;
                        enrichedCategory = eanData.category;
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

                // Stock = total quantity from all sizes in this group
                const totalQty = groupItems.reduce((sum, gi) => sum + gi.quantity, 0);
                await adminSupabase.from("stock").insert({ product_id: newProduct.id, quantity: totalQty });

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
                stockUpdated += groupItems.length;

                // Collect products for post-response enrichment
                productsToEnrich.push({ ean: firstEan, productId: newProduct.id });
            }
        }
    }

    await adminSupabase
        .from("invoices")
        .update({ status: "validated", validated_at: new Date().toISOString() })
        .eq("id", id);

    // Enrichment: EAN → UPCitemdb (brand/category) → Serper (photo)
    // For products WITHOUT EAN: search EAN by name first, then enrich
    const { searchEanByName } = await import("@/lib/ean/lookup");

    for (const { ean, productId } of productsToEnrich) {
        try {
            if (ean) {
                // Has EAN → direct lookup
                await lookupEan(ean, productId);
            } else {
                // No EAN → reverse search by product name to find EAN
                const { data: prod } = await adminSupabase
                    .from("products")
                    .select("name, brand")
                    .eq("id", productId)
                    .single();

                if (prod) {
                    const found = await searchEanByName(prod.name, prod.brand);
                    if (found) {
                        // Found EAN by name → save it and enrich
                        await adminSupabase
                            .from("products")
                            .update({ ean: found.ean, brand: found.brand ?? undefined, category: found.category ?? undefined })
                            .eq("id", productId);
                        await lookupEan(found.ean, productId);
                    } else {
                        // No EAN found → search photo by name via Serper directly
                        const { searchProductImage } = await import("@/lib/images/serper");
                        const photoUrl = await searchProductImage(prod.name, prod.brand);
                        if (photoUrl) {
                            await adminSupabase
                                .from("products")
                                .update({ photo_url: photoUrl, photo_processed_url: null, photo_source: "serper" })
                                .eq("id", productId);

                            const { createImageJob } = await import("@/lib/images/jobs");
                            await createImageJob(productId, merchant.id, photoUrl);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("[validate] enrichment failed for", productId, ":", err);
        }
    }

    // AI categorization — synchronous (must complete before response)
    if (productsCreated > 0 || productsUpdated > 0) {
        try {
            await categorizeMerchantProducts(merchant.id);
        } catch (err) {
            console.error("[validate] categorize failed:", err);
        }
    }

    // Group variants by EAN (invoice imports don't go through sync-engine)
    try {
        await groupVariantsByEAN(adminSupabase, merchant.id);
    } catch (err) {
        console.error("[validate] groupVariantsByEAN failed:", err);
    }

    return NextResponse.json({
        products_created: productsCreated,
        products_updated: productsUpdated,
        stock_updated: stockUpdated,
        pending_review: fuzzyMatched,
    });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

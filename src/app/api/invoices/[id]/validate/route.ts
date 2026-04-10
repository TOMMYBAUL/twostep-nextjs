import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchEanData, lookupEan } from "@/lib/ean/lookup";
import { categorizeMerchantProducts } from "@/lib/ai/categorize";
import { extractSize, stripSize } from "@/lib/pos/extract-size";

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

    console.log("[validate] validItems count:", validItems.length, "items:", validItems.map((i: any) => i.name));

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

    console.log("[validate] groups:", itemGroups.size, [...itemGroups.keys()]);

    for (const [groupKey, groupItems] of itemGroups) {
    // Use the first item for matching, but collect all sizes
    const item = groupItems[0];
    const allSizes = [...new Set(groupItems.map(g => g._size).filter(Boolean))] as string[];
    const cleanName = item._cleanName;
        let match: MatchResult | null = null;

        // 1) Exact EAN match — BEST: guaranteed same physical product
        if (item.ean) {
            const { data: existing } = await supabase
                .from("products")
                .select("id")
                .eq("merchant_id", merchant.id)
                .eq("ean", item.ean)
                .single();

            if (existing) match = { productId: existing.id, matchType: "exact_ean" };
        }

        // 2) Exact SKU match — supplier reference
        if (!match && item.sku) {
            const { data: existing } = await supabase
                .from("products")
                .select("id")
                .eq("merchant_id", merchant.id)
                .eq("sku", item.sku)
                .single();

            if (existing) match = { productId: existing.id, matchType: "exact_sku" };
        }

        // 3) Exact name match (case-insensitive)
        if (!match) {
            const { data: existing } = await supabase
                .from("products")
                .select("id")
                .eq("merchant_id", merchant.id)
                .ilike("name", item.name)
                .single();

            if (existing) match = { productId: existing.id, matchType: "exact_name" };
        }

        // 4) Fuzzy name match — NEVER auto-validates, always requires human review
        if (!match) {
            const normalizedItem = normalize(item.name);

            const { data: allProducts } = await supabase
                .from("products")
                .select("id, name")
                .eq("merchant_id", merchant.id);

            if (allProducts && allProducts.length > 0) {
                let bestId: string | null = null;
                let bestScore = 0;
                let bestName = "";

                for (const product of allProducts) {
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
                            bestName = product.name;
                        }
                        continue;
                    }

                    // Levenshtein similarity
                    const score = similarity(normalizedItem, normalizedProduct);
                    if (score > bestScore) {
                        bestScore = score;
                        bestId = product.id;
                        bestName = product.name;
                    }
                }

                if (bestId && bestScore >= FUZZY_THRESHOLD) {
                    match = { productId: bestId, matchType: "fuzzy" };
                    fuzzyMatched++;
                }
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

                const existingSizes: string[] = existingProduct?.available_sizes ?? [];
                const mergedSizes = [...new Set([...existingSizes, ...allSizes])];
                updateFields.available_sizes = mergedSizes;
            }

            await adminSupabase.from("products").update(updateFields).eq("id", match.productId);

            // Stock incoming for EACH item in the group (preserves per-size quantity)
            for (const gi of groupItems) {
                await adminSupabase.from("stock_incoming").insert({
                    product_id: match.productId,
                    quantity: gi.quantity,
                    invoice_id: id,
                    status: "incoming",
                });

                await supabase
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

            // Fire-and-forget: enrich if missing photo
            if (firstEan) {
                const { data: existingProd } = await supabase
                    .from("products")
                    .select("photo_url")
                    .eq("id", match.productId)
                    .single();

                if (existingProd && !existingProd.photo_url) {
                    lookupEan(firstEan, match.productId).catch(console.error);
                }
            }
        } else {
            console.log("[validate] NEW PRODUCT for group:", groupKey, "cleanName:", cleanName, "sizes:", allSizes);
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
                    ...(allSizes.length > 0 && { available_sizes: allSizes }),
                })
                .select()
                .single();

            console.log("[validate] insert result:", newProduct ? "OK id=" + newProduct.id : "FAILED", "insertErr:", insertErr?.message, "cleanName:", cleanName);
            if (newProduct) {
                createdInThisBatch.set(groupKey, newProduct.id);

                await adminSupabase.from("stock").insert({ product_id: newProduct.id, quantity: 0 });

                // Stock incoming for each item (preserves per-size quantity)
                for (const gi of groupItems) {
                    await adminSupabase.from("stock_incoming").insert({
                        product_id: newProduct.id, quantity: gi.quantity, invoice_id: id, status: "incoming",
                    });
                    await adminSupabase.from("invoice_items").update({ product_id: newProduct.id, status: "validated" }).eq("id", gi.id);
                }

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

    // Run enrichment AFTER response is sent but BEFORE function is killed
    // (Next.js `after()` guarantees execution in serverless)
    if (productsToEnrich.length > 0 || productsCreated > 0) {
        after(async () => {
            // Photo enrichment via EAN → Serper
            for (const { ean, productId } of productsToEnrich) {
                if (ean) {
                    try {
                        await lookupEan(ean, productId);
                    } catch (err) {
                        console.error("[validate:after] lookupEan failed:", err);
                    }
                }
            }
            // AI categorization
            if (productsCreated > 0) {
                try {
                    await categorizeMerchantProducts(merchant.id);
                } catch (err) {
                    console.error("[validate:after] categorize failed:", err);
                }
            }
        });
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

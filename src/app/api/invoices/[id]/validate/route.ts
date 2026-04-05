import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchEanData, lookupEan } from "@/lib/ean/lookup";
import { categorizeMerchantProducts } from "@/lib/ai/categorize";

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

    const validItems = invoice.invoice_items.filter(
        (item: { status: string }) => item.status !== "rejected"
    );

    for (const item of validItems) {
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

        if (match) {
            // Fuzzy matches require human review — don't auto-update stock
            if (match.matchType === "fuzzy") {
                await supabase
                    .from("invoice_items")
                    .update({
                        product_id: match.productId,
                        status: "pending_review",
                        match_type: "fuzzy",
                    })
                    .eq("id", item.id);
                // Don't update stock or product — wait for human confirmation
                continue;
            }

            // Exact matches (EAN, SKU, name) — safe to auto-validate
            await supabase.from("products").update({
                purchase_price: item.unit_price_ht,
                ...(sellingPrice && { price: sellingPrice }),
                ...(item.ean && { ean: item.ean }),
                ...(item.sku && { sku: item.sku }),
            }).eq("id", match.productId);

            // Stock goes to "incoming" — NOT available yet.
            // The merchant confirms receipt, or POS sale triggers availability.
            await supabase.from("stock_incoming").insert({
                product_id: match.productId,
                quantity: item.quantity,
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
                .eq("id", item.id);

            productsUpdated++;
            stockUpdated++;

            // Fire-and-forget: enrich existing product if missing photo
            if (item.ean) {
                const { data: existingProd } = await supabase
                    .from("products")
                    .select("photo_url")
                    .eq("id", match.productId)
                    .single();

                if (existingProd && !existingProd.photo_url) {
                    lookupEan(item.ean, match.productId).catch(console.error);
                }
            }
        } else {
            // ── NEW PRODUCT: enrich BEFORE inserting ──────────────────
            let enrichedName = item.name;
            let enrichedBrand: string | null = null;
            let enrichedCategory: string | null = null;

            if (item.ean) {
                try {
                    const eanData = await fetchEanData(item.ean);
                    if (eanData) {
                        if (eanData.name && eanData.name !== "Unknown") enrichedName = eanData.name;
                        enrichedBrand = eanData.brand;
                        enrichedCategory = eanData.category;
                    }
                } catch (err) {
                    console.error("[validate] EAN pre-enrichment failed:", err);
                }
            }

            const { data: newProduct } = await supabase
                .from("products")
                .insert({
                    merchant_id: merchant.id,
                    name: item.name,
                    canonical_name: enrichedName !== item.name ? enrichedName : null,
                    ean: item.ean,
                    sku: item.sku,
                    price: sellingPrice,
                    purchase_price: item.unit_price_ht,
                    ...(enrichedBrand && { brand: enrichedBrand }),
                    ...(enrichedCategory && { category: enrichedCategory }),
                })
                .select()
                .single();

            if (newProduct) {
                // Create product with zero stock — not available yet
                await supabase.from("stock").insert({
                    product_id: newProduct.id,
                    quantity: 0,
                });

                // Stock goes to incoming — merchant confirms when received
                await supabase.from("stock_incoming").insert({
                    product_id: newProduct.id,
                    quantity: item.quantity,
                    invoice_id: id,
                    status: "incoming",
                });

                await supabase
                    .from("invoice_items")
                    .update({ product_id: newProduct.id, status: "validated" })
                    .eq("id", item.id);

                productsCreated++;
                stockUpdated++;

                // Fire-and-forget: apply photo enrichment via lookupEan
                // (will find cached EAN data and handle image job creation)
                if (item.ean) {
                    lookupEan(item.ean, newProduct.id).catch(console.error);
                }
            }
        }
    }

    await supabase
        .from("invoices")
        .update({ status: "imported", validated_at: new Date().toISOString() })
        .eq("id", id);

    // Fire-and-forget: AI categorization for any new/uncategorized products
    if (productsCreated > 0) {
        categorizeMerchantProducts(merchant.id).catch(console.error);
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

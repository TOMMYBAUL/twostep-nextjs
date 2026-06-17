import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { productConfidence } from "@/lib/stock/product-confidence";
import { reportsWindowStartIso } from "@/lib/stock/reports";

export async function GET(request: NextRequest) {
    const merchantIds = request.nextUrl.searchParams.get("merchant_ids");
    if (!merchantIds) {
        return NextResponse.json({ products: [] });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = merchantIds.split(",").filter((id) => uuidRegex.test(id.trim())).slice(0, 50);
    if (ids.length === 0) {
        return NextResponse.json({ products: [] });
    }

    const category = request.nextUrl.searchParams.get("category");
    const size = request.nextUrl.searchParams.get("size");
    const shoeSize = request.nextUrl.searchParams.get("shoe_size");
    const clothingSize = request.nextUrl.searchParams.get("clothing_size");
    const promoFirst = request.nextUrl.searchParams.get("promo_first") === "true";

    const supabase = await createClient();

    // Only fetch products from the specified merchants
    let query = supabase
        .from("products")
        .select("id, name, price, photo_url, photo_processed_url, category, size, available_sizes, merchant_id, pos_item_id, created_at, merchants!inner(name, photo_url)")
        .in("merchant_id", ids)
        .is("variant_of", null)
        .eq("visible", true)
        .order("created_at", { ascending: false })
        .limit(60);

    if (category) query = query.eq("category", category);
    if (size) query = query.eq("size", size);
    // Note: clothingSize and shoeSize are NOT used as DB filters —
    // they're used post-query to SORT matching sizes first (not exclude others)

    const { data: products, error } = await query;

    if (error) {
        return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    // Get stock and promos for these products
    const productIds = (products ?? []).map((p: any) => p.id);

    if (productIds.length === 0) {
        return NextResponse.json({ products: [] });
    }

    // ingest_credentials et stock_reports sont en RLS owner-only → client admin.
    const admin = createAdminClient();
    const [{ data: stockData }, { data: promoData }, { data: ingestData }, { data: reportData }] = await Promise.all([
        supabase.from("stock").select("product_id, quantity, updated_at, source").in("product_id", productIds),
        supabase.from("promotions").select("product_id, sale_price").in("product_id", productIds).lte("starts_at", new Date().toISOString()).gte("ends_at", new Date().toISOString()),
        admin.from("ingest_credentials").select("merchant_id").in("merchant_id", ids),
        admin.from("stock_reports").select("product_id").in("product_id", productIds).eq("reason", "not_in_store").gte("created_at", reportsWindowStartIso()),
    ]);

    const stockMap = new Map((stockData ?? []).map((s: any) => [s.product_id, s]));
    const promoMap = new Map((promoData ?? []).map((p: any) => [p.product_id, p.sale_price]));
    const ingestMerchants = new Set((ingestData ?? []).map((i: any) => i.merchant_id));
    const reportCounts = new Map<string, number>();
    for (const r of reportData ?? []) {
        reportCounts.set(r.product_id, (reportCounts.get(r.product_id) ?? 0) + 1);
    }

    // Helper: check if a product has a given size with stock > 0 in available_sizes
    const hasSizeInStock = (availableSizes: any, targetSize: string): boolean => {
        if (!Array.isArray(availableSizes)) return false;
        return availableSizes.some(
            (entry: any) => entry.size === targetSize && (entry.quantity ?? 0) > 0,
        );
    };

    const userSizes = [clothingSize, shoeSize].filter(Boolean) as string[];

    const mapped = (products ?? [])
        .filter((p: any) => (stockMap.get(p.id)?.quantity ?? 0) > 0)
        .map((p: any) => ({
            product_id: p.id,
            product_name: p.name,
            product_price: p.price,
            product_photo: p.photo_processed_url ?? p.photo_url,
            stock_quantity: stockMap.get(p.id)?.quantity ?? 0,
            merchant_id: p.merchant_id,
            merchant_name: p.merchants?.name ?? "",
            merchant_photo: p.merchants?.photo_url ?? null,
            sale_price: promoMap.get(p.id) ?? null,
            category: p.category,
            confidence: productConfidence({
                quantity: stockMap.get(p.id)?.quantity ?? 0,
                lastEventAt: stockMap.get(p.id)?.updated_at ?? null,
                storedSource: stockMap.get(p.id)?.source ?? null,
                posItemId: p.pos_item_id ?? null,
                merchantHasIngest: ingestMerchants.has(p.merchant_id),
                recentNotInStoreReports: reportCounts.get(p.id) ?? 0,
            }),
            _availableSizes: p.available_sizes,
            distance_km: 0,
        }));

    // When user sizes are provided, FILTER to products with those sizes in stock
    // Sizeless products (no available_sizes) pass through — they fit everyone
    let result = mapped;
    if (userSizes.length > 0) {
        result = mapped.filter((p: any) =>
            !Array.isArray(p._availableSizes) || p._availableSizes.length === 0 ||
            userSizes.some((s) => hasSizeInStock(p._availableSizes, s)),
        );
    }

    // Sort: promos first
    if (promoFirst) {
        result.sort((a: any, b: any) => {
            const aHasPromo = a.sale_price !== null ? 1 : 0;
            const bHasPromo = b.sale_price !== null ? 1 : 0;
            return bHasPromo - aHasPromo;
        });
    }

    // Remove internal field before sending response
    for (const item of result) {
        delete item._availableSizes;
    }

    return NextResponse.json({ products: result }, {
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" },
    });
}

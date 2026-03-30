import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const merchantIds = request.nextUrl.searchParams.get("merchant_ids");
    if (!merchantIds) {
        return NextResponse.json({ products: [] });
    }

    const ids = merchantIds.split(",").filter(Boolean).slice(0, 50);
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
        .select("id, name, price, photo_url, photo_processed_url, category, size, available_sizes, merchant_id, created_at, merchants!inner(name, photo_url)")
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

    const [{ data: stockData }, { data: promoData }] = await Promise.all([
        supabase.from("stock").select("product_id, quantity").in("product_id", productIds),
        supabase.from("promotions").select("product_id, sale_price").in("product_id", productIds).gte("ends_at", new Date().toISOString()),
    ]);

    const stockMap = new Map((stockData ?? []).map((s: any) => [s.product_id, s.quantity]));
    const promoMap = new Map((promoData ?? []).map((p: any) => [p.product_id, p.sale_price]));

    // Helper: check if a product has a given size with stock > 0 in available_sizes
    const hasSizeInStock = (availableSizes: any, targetSize: string): boolean => {
        if (!Array.isArray(availableSizes)) return false;
        return availableSizes.some(
            (entry: any) => entry.size === targetSize && (entry.quantity ?? 0) > 0,
        );
    };

    const userSizes = [clothingSize, shoeSize].filter(Boolean) as string[];

    const mapped = (products ?? [])
        .filter((p: any) => (stockMap.get(p.id) ?? 0) > 0)
        .map((p: any) => ({
            product_id: p.id,
            product_name: p.name,
            product_price: p.price,
            product_photo: p.photo_processed_url ?? p.photo_url,
            stock_quantity: stockMap.get(p.id) ?? 0,
            merchant_id: p.merchant_id,
            merchant_name: p.merchants?.name ?? "",
            merchant_photo: p.merchants?.photo_url ?? null,
            sale_price: promoMap.get(p.id) ?? null,
            category: p.category,
            _availableSizes: p.available_sizes,
            distance_km: 0,
        }));

    // When user sizes are provided, FILTER to only products with those sizes in stock
    let result = mapped;
    if (userSizes.length > 0) {
        result = mapped.filter((p: any) =>
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
        headers: { "Cache-Control": "private, s-maxage=30" },
    });
}

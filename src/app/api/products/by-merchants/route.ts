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
        .select("id, name, price, photo_url, photo_processed_url, category, size, merchant_id, created_at, merchants!inner(name, photo_url)")
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

    const result = (products ?? [])
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
            size: p.size ?? null,
            distance_km: 0,
        }));

    // Sort: size-matched first, then promos, then rest
    const userSizes = [clothingSize, shoeSize].filter(Boolean) as string[];

    if (promoFirst || userSizes.length > 0) {
        result.sort((a: any, b: any) => {
            // 1. Size match has highest priority
            if (userSizes.length > 0) {
                const aMatchesSize = a.size && userSizes.includes(a.size) ? 1 : 0;
                const bMatchesSize = b.size && userSizes.includes(b.size) ? 1 : 0;
                if (aMatchesSize !== bMatchesSize) return bMatchesSize - aMatchesSize;
            }
            // 2. Promos second
            if (promoFirst) {
                const aHasPromo = a.sale_price !== null ? 1 : 0;
                const bHasPromo = b.sale_price !== null ? 1 : 0;
                if (aHasPromo !== bHasPromo) return bHasPromo - aHasPromo;
            }
            return 0;
        });
    }

    return NextResponse.json({ products: result }, {
        headers: { "Cache-Control": "private, s-maxage=30" },
    });
}

import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
        return NextResponse.json({ error: "Invalid merchant ID" }, { status: 400 });
    }

    const supabase = await createClient();

    // Auth check
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify merchant belongs to user
    const { data: merchant } = await supabase
        .from("merchants")
        .select("id, name, photo_url, status, pos_type")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

    if (!merchant) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Period: last 7 days vs previous 7 days
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // 1. Page views (may not exist yet — handle gracefully)
    let viewsThisWeek = 0;
    let viewsLastWeek = 0;
    try {
        const { count: vtw } = await supabase
            .from("page_views")
            .select("*", { count: "exact", head: true })
            .eq("merchant_id", id)
            .gte("created_at", weekAgo.toISOString());
        viewsThisWeek = vtw ?? 0;

        const { count: vlw } = await supabase
            .from("page_views")
            .select("*", { count: "exact", head: true })
            .eq("merchant_id", id)
            .gte("created_at", twoWeeksAgo.toISOString())
            .lt("created_at", weekAgo.toISOString());
        viewsLastWeek = vlw ?? 0;
    } catch {
        // table may not exist yet
    }

    // 2. Favorites received (user_favorites → products → merchant)
    let favoritesThisWeek = 0;
    let favoritesLastWeek = 0;
    try {
        const { count: ftw } = await supabase
            .from("user_favorites")
            .select("*, products!inner(merchant_id)", { count: "exact", head: true })
            .eq("products.merchant_id", id)
            .gte("created_at", weekAgo.toISOString());
        favoritesThisWeek = ftw ?? 0;

        const { count: flw } = await supabase
            .from("user_favorites")
            .select("*, products!inner(merchant_id)", { count: "exact", head: true })
            .eq("products.merchant_id", id)
            .gte("created_at", twoWeeksAgo.toISOString())
            .lt("created_at", weekAgo.toISOString());
        favoritesLastWeek = flw ?? 0;
    } catch {
        // join may fail if no products
    }

    // 3. Follows
    let followsTotal = 0;
    try {
        const { count } = await supabase
            .from("user_follows")
            .select("*", { count: "exact", head: true })
            .eq("merchant_id", id);
        followsTotal = count ?? 0;
    } catch {
        // table may not exist yet
    }

    // 4. Products & stock
    const { data: products } = await supabase
        .from("products")
        .select("id, name, photo_url, stock(quantity)")
        .eq("merchant_id", id);

    const totalProducts = products?.length ?? 0;
    const inStock =
        products?.filter(
            (p: any) => (p.stock?.[0]?.quantity ?? p.stock?.quantity ?? 0) > 0
        ).length ?? 0;
    const lowStock =
        products?.filter((p: any) => {
            const qty = p.stock?.[0]?.quantity ?? p.stock?.quantity ?? 0;
            return qty > 0 && qty <= 3;
        }).length ?? 0;
    const outOfStock =
        products?.filter(
            (p: any) => (p.stock?.[0]?.quantity ?? p.stock?.quantity ?? 0) === 0
        ).length ?? 0;
    const withPhoto = products?.filter((p: any) => !!p.photo_url).length ?? 0;

    // 5. Active promos — promotions are linked to products, not directly to merchant
    let activePromos = 0;
    try {
        const { data: merchantProducts } = await supabase
            .from("products")
            .select("id")
            .eq("merchant_id", id);
        const productIds = (merchantProducts ?? []).map((p: any) => p.id);

        if (productIds.length > 0) {
            const { count } = await supabase
                .from("promotions")
                .select("*", { count: "exact", head: true })
                .in("product_id", productIds)
                .lte("starts_at", now.toISOString())
                .or(`ends_at.is.null,ends_at.gte.${now.toISOString()}`);
            activePromos = count ?? 0;
        }
    } catch {
        // table may not exist yet
    }

    // 6. Two-Step Score (server-side, 0–100)
    const hasName = !!merchant.name;
    const hasPhoto = !!merchant.photo_url;
    const hasPOS = !!merchant.pos_type;
    const hasProducts = totalProducts > 0;
    const hasStock = inStock > 0;

    const profileComplete = [hasName, hasPhoto, hasPOS, hasProducts, hasStock].filter(
        Boolean
    ).length;
    const photoRatio = totalProducts > 0 ? withPhoto / totalProducts : 0;

    const score = Math.round(
        (profileComplete / 5) * 40 +
            Math.min(photoRatio, 1) * 20 +
            Math.min(inStock / Math.max(totalProducts, 1), 1) * 20 +
            Math.min(activePromos / 2, 1) * 10 +
            (followsTotal > 0 ? 10 : 0)
    );

    return NextResponse.json(
        {
            funnel: {
                views: { current: viewsThisWeek, previous: viewsLastWeek },
                favorites: { current: favoritesThisWeek, previous: favoritesLastWeek },
                follows: { total: followsTotal },
            },
            stock: {
                total: totalProducts,
                inStock,
                lowStock,
                outOfStock,
                withPhoto,
            },
            score,
            activePromos,
        },
        {
            headers: { "Cache-Control": "private, max-age=60" },
        }
    );
}

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
        .select("id, name, photo_url, status, pos_type, description, address, opening_hours, pos_last_sync, instagram_url, tiktok_url, website_url")
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
        .select("id, name, photo_url, ean, created_at, stock(quantity, updated_at)")
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

    // 6. Google Merchant connection
    let googleConn: { products_pushed: number; last_feed_status: string } | null = null;
    try {
        const { data } = await supabase
            .from("google_merchant_connections")
            .select("products_pushed, last_feed_status")
            .eq("merchant_id", id)
            .maybeSingle();
        googleConn = data;
    } catch {
        // table may not exist yet
    }

    // ═══════════════════════════════════════
    // 7. Two-Step Score — Visibilité réelle
    // ═══════════════════════════════════════

    const withEAN = products?.filter((p: any) => !!p.ean).length ?? 0;

    // Helper: logarithmic scale for engagement metrics
    function logScale(value: number, cap: number, maxPts: number): number {
        if (value <= 0) return 0;
        return Math.min(Math.log2(value + 1) / Math.log2(cap + 1), 1) * maxPts;
    }

    // FOUNDATION (max 20) — Le minimum pour être trouvable
    const foundationScore = (() => {
        let s = 0;
        if (merchant.name) s += 3;
        if (merchant.description) s += 3;
        if (merchant.photo_url) s += 3;
        if (merchant.address && merchant.opening_hours) s += 3;
        if (totalProducts > 0) s += Math.round((withPhoto / totalProducts) * 4);
        if (totalProducts > 0) s += Math.round((withEAN / totalProducts) * 4);
        return Math.min(s, 20);
    })();

    // ENGAGEMENT (max 40) — Les gens te voient-ils ?
    const engagementScore = (() => {
        const viewsPts = logScale(viewsThisWeek, 128, 15);
        const favPts = logScale(favoritesThisWeek, 16, 10);
        const followPts = logScale(followsTotal, 64, 10);
        let growthPts = 0;
        if (viewsThisWeek > 0 && viewsLastWeek > 0 && viewsThisWeek > viewsLastWeek) growthPts = 5;
        else if (viewsThisWeek > 0 && viewsLastWeek > 0 && viewsThisWeek >= viewsLastWeek * 0.8) growthPts = 3;
        else if (viewsThisWeek > 0) growthPts = 1;
        return Math.min(Math.round(viewsPts + favPts + followPts + growthPts), 40);
    })();

    // ACTIVITY (max 20) — Tu gardes ta boutique vivante ?
    const activityScore = (() => {
        let s = 0;
        // Stock freshness — most recent stock update or POS sync
        const stockDates = (products ?? [])
            .map((p: any) => p.stock?.[0]?.updated_at ?? p.stock?.updated_at)
            .filter(Boolean)
            .map((d: string) => new Date(d).getTime());
        const posSync = merchant.pos_last_sync ? new Date(merchant.pos_last_sync).getTime() : 0;
        const mostRecent = Math.max(...stockDates, posSync, 0);
        if (mostRecent > 0) {
            const daysSince = (now.getTime() - mostRecent) / 86_400_000;
            if (daysSince < 1) s += 8;
            else if (daysSince < 3) s += 6;
            else if (daysSince < 7) s += 4;
            else if (daysSince < 14) s += 2;
        }
        // Active promos
        s += Math.min(activePromos, 2) * 3;
        // Catalogue updated recently
        const recentProducts = (products ?? []).filter(
            (p: any) => new Date(p.created_at).getTime() > twoWeeksAgo.getTime()
        ).length;
        if (recentProducts > 0) s += 6;
        else {
            const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
            const recentMonth = (products ?? []).filter(
                (p: any) => new Date(p.created_at).getTime() > monthAgo.getTime()
            ).length;
            if (recentMonth > 0) s += 3;
        }
        return Math.min(s, 20);
    })();

    // REACH (max 20) — Au-delà de Two-Step
    const reachScore = (() => {
        let s = 0;
        if (googleConn) s += 7;
        if (googleConn && googleConn.products_pushed > 0 && googleConn.last_feed_status === "success") s += 8;
        const socialCount = [merchant.instagram_url, merchant.tiktok_url, merchant.website_url].filter(Boolean).length;
        s += Math.min(socialCount * 2, 5);
        return Math.min(s, 20);
    })();

    const score = foundationScore + engagementScore + activityScore + reachScore;

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
            scoreBreakdown: {
                foundation: foundationScore,
                engagement: engagementScore,
                activity: activityScore,
                reach: reachScore,
            },
            activePromos,
        },
        {
            headers: { "Cache-Control": "private, max-age=60" },
        }
    );
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "page-views", 60);
    if (limited) return limited;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { merchant_id, page_type, product_id } = body as { merchant_id?: string; page_type?: string; product_id?: string };

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!merchant_id || !uuidRegex.test(merchant_id)) {
        return NextResponse.json({ error: "Valid merchant_id required" }, { status: 400 });
    }

    const VALID_PAGE_TYPES = ["shop", "product", "promo"] as const;
    type PageType = typeof VALID_PAGE_TYPES[number];
    const resolvedPageType: PageType = (VALID_PAGE_TYPES as readonly string[]).includes(page_type ?? "")
        ? (page_type as PageType)
        : "shop";

    // Use user-scoped client only for auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Admin client bypasses RLS — needed because:
    // 1. page_views SELECT RLS only allows merchant owners, not viewers (dedup would fail)
    // 2. page_views INSERT RLS requires auth.uid() IS NOT NULL (anonymous views would fail)
    const admin = createAdminClient();

    // Verify merchant exists before inserting
    const { data: merchant } = await admin
        .from("merchants")
        .select("id")
        .eq("id", merchant_id)
        .single();

    if (!merchant) {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    // Dedup: one view per user per merchant per hour (if authenticated)
    if (user) {
        const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
        const { count } = await admin
            .from("page_views")
            .select("*", { count: "exact", head: true })
            .eq("merchant_id", merchant_id)
            .eq("viewer_id", user.id)
            .gte("created_at", oneHourAgo);
        if (count && count > 0) {
            return NextResponse.json({ ok: true, deduplicated: true });
        }
    }

    await admin.from("page_views").insert({
        merchant_id,
        viewer_id: user?.id ?? null,
        page_type: resolvedPageType,
        product_id: product_id ?? null,
    });

    return NextResponse.json({ ok: true });
}

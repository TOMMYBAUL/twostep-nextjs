import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProductId } from "@/lib/slug";

export async function GET(req: NextRequest) {
    const slug = req.nextUrl.searchParams.get("slug") ?? "";
    const supabase = createAdminClient();

    // 1. Try resolveProductId
    const resolvedId = await resolveProductId(slug);

    // 2. Direct query by slug
    const { data: bySlug, error: slugErr } = await supabase
        .from("products")
        .select("id, slug, name, visible")
        .eq("slug", slug)
        .maybeSingle();

    // 3. If resolvedId, get product
    let product = null;
    let productErr = null;
    if (resolvedId) {
        const { data, error } = await supabase
            .from("products")
            .select("id, slug, name, canonical_name, visible, category, merchant_id, merchants(name, slug)")
            .eq("id", resolvedId)
            .eq("visible", true)
            .single();
        product = data;
        productErr = error?.message ?? null;
    }

    // 4. Check merchant
    let merchant = null;
    if (product?.merchant_id) {
        const { data } = await supabase
            .from("merchants")
            .select("id, slug, name")
            .eq("id", product.merchant_id)
            .single();
        merchant = data;
    }

    return NextResponse.json({
        input: slug,
        resolvedId,
        bySlug: bySlug ?? null,
        slugErr: slugErr?.message ?? null,
        product,
        productErr,
        merchant,
    });
}

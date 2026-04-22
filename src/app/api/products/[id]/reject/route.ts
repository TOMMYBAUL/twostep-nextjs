import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/products/[id]/reject
 * Rejects the enrichment proposal.
 *
 * Body: { restore_original?: boolean }
 *  - true  → restore original_name + original_image_url, keep the product visible (validated).
 *            Use case: enrichment proposed wrong data, but the original POS row is fine.
 *  - false → mark rejected + visible=false (the product is hidden from the catalog).
 *            Use case: junk product the merchant doesn't want to sell.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    let restoreOriginal = false;
    try {
        if (req.headers.get("content-type")?.includes("application/json")) {
            const body = await req.json().catch(() => ({}));
            restoreOriginal = body.restore_original === true;
        } else {
            const form = await req.formData().catch(() => null);
            restoreOriginal = form?.get("restore_original") === "true";
        }
    } catch {
        // ignore — default false
    }

    const { data: product } = await supabase
        .from("products")
        .select("id, merchant_id, original_name, original_image_url, merchants!inner(user_id)")
        .eq("id", id)
        .single();

    if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const merchantsJoin = product.merchants as unknown as { user_id: string } | { user_id: string }[];
    const ownerId = Array.isArray(merchantsJoin) ? merchantsJoin[0]?.user_id : merchantsJoin?.user_id;
    if (ownerId !== user.id) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = restoreOriginal
        ? {
              review_status: "validated",
              visible: true,
              ...(product.original_name ? { name: product.original_name, canonical_name: null } : {}),
              ...(product.original_image_url
                  ? { photo_url: product.original_image_url, photo_processed_url: null }
                  : {}),
          }
        : {
              review_status: "rejected",
              visible: false,
          };

    const { error } = await supabase.from("products").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        ok: true,
        id,
        review_status: restoreOriginal ? "validated" : "rejected",
        restored_original: restoreOriginal,
    });
}

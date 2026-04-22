import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActivePosAccessToken } from "@/lib/pos/access-token";

/**
 * POST /api/products/[id]/validate
 * Marks an enriched product as validated → visible on the public catalog.
 * Best-effort: also pushes the enriched EAN back into the merchant's POS
 * (after the response is sent, via `after()`).
 * Owner check via merchants.user_id.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    // Ownership: product → merchant → user
    const { data: product } = await supabase
        .from("products")
        .select("id, merchant_id, ean, pos_item_id, merchants!inner(user_id)")
        .eq("id", id)
        .single();

    if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const merchantsJoin = product.merchants as unknown as { user_id: string } | { user_id: string }[];
    const ownerId = Array.isArray(merchantsJoin) ? merchantsJoin[0]?.user_id : merchantsJoin?.user_id;
    if (ownerId !== user.id) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error } = await supabase
        .from("products")
        .update({
            review_status: "validated",
            visible: true,
        })
        .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Best-effort writeback to POS (after response). Only if the product came
    // from a POS sync (has pos_item_id) and an EAN was found by enrichment.
    if (product.pos_item_id && product.ean) {
        after(async () => {
            const admin = createAdminClient();
            const conn = await getActivePosAccessToken(admin, product.merchant_id);
            if (!conn?.adapter.updatePosProduct) return;
            const ok = await conn.adapter.updatePosProduct(
                conn.accessToken,
                product.pos_item_id!,
                { ean: product.ean },
                { shopDomain: conn.shopDomain ?? undefined },
            );
            if (process.env.NODE_ENV === "development") {
                console.log(`[validate] POS writeback ${conn.provider} for ${id} (ean=${product.ean}): ${ok ? "OK" : "FAIL"}`);
            }
        });
    }

    return NextResponse.json({ ok: true, id, review_status: "validated" });
}

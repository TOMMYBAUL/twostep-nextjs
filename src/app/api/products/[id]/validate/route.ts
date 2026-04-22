import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/products/[id]/validate
 * Marks an enriched product as validated → visible on the public catalog.
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
        .select("id, merchant_id, merchants!inner(user_id)")
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

    return NextResponse.json({ ok: true, id, review_status: "validated" });
}

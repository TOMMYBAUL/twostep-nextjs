import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActivePosAccessToken } from "@/lib/pos/access-token";

/**
 * POST /api/products/bulk-validate
 * Body: { ids: string[] }
 * Validates a batch of products owned by the authenticated merchant.
 * Best-effort writeback to POS (after response): pushes the enriched EAN
 * back to the merchant's POS for products that have a pos_item_id and an EAN.
 * Products owned by other merchants are silently skipped (no error leak).
 */
export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    let ids: string[] = [];
    try {
        const body = await req.json();
        if (Array.isArray(body.ids)) {
            ids = body.ids.filter((x: unknown) => typeof x === "string");
        }
    } catch {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    if (ids.length === 0) return NextResponse.json({ ok: true, validated: 0 });
    if (ids.length > 500) return NextResponse.json({ error: "too_many_ids" }, { status: 400 });

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();
    if (!merchant) return NextResponse.json({ error: "no_merchant" }, { status: 403 });

    // Snapshot products eligible for POS writeback BEFORE the update,
    // so we can push their EAN back to the POS afterwards.
    const { data: eligibleForPush } = await supabase
        .from("products")
        .select("id, pos_item_id, ean")
        .eq("merchant_id", merchant.id)
        .in("id", ids)
        .not("pos_item_id", "is", null)
        .not("ean", "is", null);

    const { error, count } = await supabase
        .from("products")
        .update({ review_status: "validated", visible: true }, { count: "exact" })
        .eq("merchant_id", merchant.id)
        .in("id", ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (eligibleForPush && eligibleForPush.length > 0) {
        after(async () => {
            const admin = createAdminClient();
            const conn = await getActivePosAccessToken(admin, merchant.id);
            if (!conn?.adapter.updatePosProduct) return;
            let ok = 0;
            let fail = 0;
            for (const p of eligibleForPush) {
                const success = await conn.adapter.updatePosProduct(
                    conn.accessToken,
                    p.pos_item_id!,
                    { ean: p.ean },
                    { shopDomain: conn.shopDomain ?? undefined },
                );
                if (success) ok++; else fail++;
            }
            if (process.env.NODE_ENV === "development") {
                console.log(`[bulk-validate] POS writeback ${conn.provider}: ${ok} ok, ${fail} fail`);
            }
        });
    }

    return NextResponse.json({ ok: true, validated: count ?? 0 });
}

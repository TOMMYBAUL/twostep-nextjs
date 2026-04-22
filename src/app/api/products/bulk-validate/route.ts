import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/products/bulk-validate
 * Body: { ids: string[] }
 * Validates a batch of products owned by the authenticated merchant.
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

    const { error, count } = await supabase
        .from("products")
        .update({ review_status: "validated", visible: true }, { count: "exact" })
        .eq("merchant_id", merchant.id)
        .in("id", ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, validated: count ?? 0 });
}

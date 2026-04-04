import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

    const supabase = await createClient();

    // Verify merchant exists before inserting
    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("id", merchant_id)
        .single();

    if (!merchant) {
        return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    // Get viewer ID if authenticated (optional)
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("page_views").insert({
        merchant_id,
        viewer_id: user?.id ?? null,
        page_type: page_type ?? "shop",
        product_id: product_id ?? null,
    });

    return NextResponse.json({ ok: true });
}

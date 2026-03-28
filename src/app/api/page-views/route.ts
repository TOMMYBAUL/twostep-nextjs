import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "page-views", 60);
    if (limited) return limited;

    const body = await request.json();
    const { merchant_id, page_type, product_id } = body;

    if (!merchant_id) {
        return NextResponse.json({ error: "merchant_id required" }, { status: 400 });
    }

    const supabase = await createClient();

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

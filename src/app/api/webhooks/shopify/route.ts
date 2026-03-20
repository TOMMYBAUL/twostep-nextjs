import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyAdapter } from "@/lib/pos/shopify";

export async function POST(request: NextRequest) {
    const body = await request.text();
    const signature = request.headers.get("x-shopify-hmac-sha256") ?? "";

    if (!shopifyAdapter.verifyWebhook(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const event = JSON.parse(body);
    const stockUpdates = shopifyAdapter.parseWebhookEvent(event);

    if (stockUpdates) {
        // Find merchant by POS credentials and update stock
        // Implementation follows square webhook pattern
    }

    return NextResponse.json({ ok: true });
}

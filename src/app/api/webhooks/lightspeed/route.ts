import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lightspeedAdapter } from "@/lib/pos/lightspeed";

export async function POST(request: NextRequest) {
    const body = await request.text();
    const signature = request.headers.get("x-lightspeed-signature") ?? "";

    if (!lightspeedAdapter.verifyWebhook(body, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const supabase = createAdminClient();
    // Lightspeed sale webhooks trigger a stock re-sync
    // Implementation follows square webhook pattern — find merchant, sync stock
    // For now, acknowledge the webhook
    return NextResponse.json({ ok: true });
}

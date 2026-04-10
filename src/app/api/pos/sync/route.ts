import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { syncMerchantPOS } from "@/lib/pos/sync-engine";
import { captureError } from "@/lib/error";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "pos:sync", 5);
    if (limited) return limited;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
        }

        // Read connection from pos_connections
        const { data: connection } = await supabase
            .from("pos_connections")
            .select("provider")
            .eq("merchant_id", merchant.id)
            .single();

        if (!connection) {
            return NextResponse.json({ error: "No POS connected" }, { status: 400 });
        }

        const result = await syncMerchantPOS(merchant.id, connection.provider);

        return NextResponse.json({ synced: result });
    } catch (e) {
        captureError(e, { route: "pos/sync" });
        return NextResponse.json({ error: "Sync failed" }, { status: 500 });
    }
}

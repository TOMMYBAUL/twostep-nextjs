import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { syncMerchantPOS } from "@/lib/pos/sync-engine";
import { captureError } from "@/lib/error";

export async function POST() {
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

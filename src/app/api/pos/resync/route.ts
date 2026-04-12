import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMerchantPOS } from "@/lib/pos/sync-engine";
import { captureError } from "@/lib/error";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Force re-sync: resets all POS-sourced products then rebuilds from POS catalog.
 * Preserves product UUIDs and FK references (favorites, feed_events, promos).
 * Use when Two-Step and POS are desynchronized.
 */
export async function POST(request: Request) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "pos:resync", 2);
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

        const { data: connection } = await supabase
            .from("pos_connections")
            .select("provider")
            .eq("merchant_id", merchant.id)
            .single();

        if (!connection) {
            return NextResponse.json({ error: "No POS connected" }, { status: 400 });
        }

        // Reset all POS products: hide and unlink variants (preserves product IDs + FKs)
        const admin = createAdminClient();
        const { data: resetProducts } = await admin
            .from("products")
            .update({ visible: false, variant_of: null })
            .eq("merchant_id", merchant.id)
            .not("pos_item_id", "is", null)
            .select("id");

        const resetCount = resetProducts?.length ?? 0;

        // Run full sync — will re-match by pos_item_id and rebuild visibility
        const result = await syncMerchantPOS(merchant.id, connection.provider, true);

        return NextResponse.json({
            resync: true,
            reset_before: resetCount,
            ...result,
        });
    } catch (e) {
        captureError(e, { route: "pos/resync" });
        return NextResponse.json({ error: "Re-sync failed" }, { status: 500 });
    }
}

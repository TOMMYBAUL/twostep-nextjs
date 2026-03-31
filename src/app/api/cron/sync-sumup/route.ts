import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/pos";
import { captureError } from "@/lib/error";
import { decrypt } from "@/lib/email/encryption";
import { syncMerchantPOS } from "@/lib/pos/sync-engine";

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const adapter = getAdapter("sumup");

    // Find all SumUp-connected merchants
    const { data: connections } = await supabase
        .from("pos_connections")
        .select("merchant_id, access_token, refresh_token, expires_at")
        .eq("provider", "sumup");

    if (!connections || connections.length === 0) {
        return NextResponse.json({ synced: 0, message: "No SumUp merchants" });
    }

    let synced = 0;
    let errors = 0;

    for (const conn of connections) {
        try {
            // Refresh token if expired so syncMerchantPOS finds valid tokens in DB
            if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
                const refreshToken = decrypt(conn.refresh_token);
                const newTokens = await adapter.refreshToken(refreshToken);
                if (newTokens) {
                    const { encrypt: enc } = await import("@/lib/email/encryption");
                    await supabase
                        .from("pos_connections")
                        .update({
                            access_token: enc(newTokens.access_token),
                            refresh_token: enc(newTokens.refresh_token),
                            expires_at: newTokens.expires_at,
                        })
                        .eq("merchant_id", conn.merchant_id)
                        .eq("provider", "sumup");
                }
            }

            await syncMerchantPOS(conn.merchant_id, "sumup");
            synced++;
        } catch (err) {
            errors++;
            captureError(err, { merchant: conn.merchant_id, cron: "sync-sumup" });
        }
    }

    return NextResponse.json({ synced, errors, total: connections.length });
}

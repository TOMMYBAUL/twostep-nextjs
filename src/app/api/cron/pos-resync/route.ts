import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resyncAllMerchantsStock } from "@/lib/pos/resync-stock";
import { captureError } from "@/lib/error";

/**
 * Cron : re-sync du stock absolu de tous les marchands POS connectés.
 * Auto-guérit la dérive (retours non captés par les webhooks Shopify/Lightspeed).
 * À planifier toutes les ~6 h dans vercel.json.
 */

// Boucle N marchands × (getStock POS réseau + upserts par lots) : sans maxDuration,
// le timeout Vercel par défaut coupe la fonction en plein vol → marchands restants
// jamais guéris ce run, sans signal (même classe que cron/google-feed/quality-check).
export const maxDuration = 300;

export async function GET(request: Request) {
    const authHeader = request.headers.get("authorization");
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const admin = createAdminClient();
        const results = await resyncAllMerchantsStock(admin);
        return NextResponse.json({
            ok: true,
            merchants: results.length,
            total_updated: results.reduce((n, r) => n + r.updated, 0),
            errors: results.filter((r) => !r.ok).length,
            results,
        });
    } catch (e) {
        captureError(e, { route: "cron/pos-resync" });
        return NextResponse.json(
            { error: `POS resync failed: ${e instanceof Error ? e.message : "unknown"}` },
            { status: 500 },
        );
    }
}

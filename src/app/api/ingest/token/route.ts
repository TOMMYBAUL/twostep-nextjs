import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateIngestToken, rotateIngestToken } from "@/lib/ingest/token";
import { captureError } from "@/lib/error";

/**
 * Récupération / rotation du jeton de push stock par le marchand (session).
 * GET  → renvoie le jeton + l'URL de push + un exemple de commande, créant le
 *        jeton à la volée si absent.
 * POST → régénère le jeton (rotation).
 */
async function getMerchantId(): Promise<string | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();
    return merchant?.id ?? null;
}

function pushInfo(token: string) {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twostep.fr";
    const pushUrl = `${base}/api/ingest/stock`;
    return {
        token,
        push_url: pushUrl,
        contract: "CSV ou XLSX avec colonnes: code-barres (EAN), quantité, prix",
        example_curl: `curl -X POST "${pushUrl}" -H "Authorization: Bearer ${token}" -F "file=@stock.csv"`,
    };
}

export async function GET() {
    try {
        const merchantId = await getMerchantId();
        if (!merchantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const admin = createAdminClient();
        const token = await getOrCreateIngestToken(merchantId, admin);

        const { data: cred } = await admin
            .from("ingest_credentials")
            .select("last_used_at, last_rows, last_status")
            .eq("merchant_id", merchantId)
            .maybeSingle();

        return NextResponse.json({ ...pushInfo(token), ...cred });
    } catch (e) {
        captureError(e, { route: "ingest/token", method: "GET" });
        return NextResponse.json({ error: "Failed to get token" }, { status: 500 });
    }
}

export async function POST() {
    try {
        const merchantId = await getMerchantId();
        if (!merchantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const admin = createAdminClient();
        const token = await rotateIngestToken(merchantId, admin);
        return NextResponse.json(pushInfo(token));
    } catch (e) {
        captureError(e, { route: "ingest/token", method: "POST" });
        return NextResponse.json({ error: "Failed to rotate token" }, { status: 500 });
    }
}

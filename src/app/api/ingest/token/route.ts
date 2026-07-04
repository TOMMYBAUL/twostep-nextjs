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
    const { data: merchant, error } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();
    // `.single()` renvoie `PGRST116` sur 0 ligne (= l'utilisateur n'est pas marchand →
    // null → 401 légitime ; `merchants(user_id)` est UNIQUE (001) donc PGRST116 ne peut
    // structurellement signifier que 0 ligne, jamais >1). Toute AUTRE erreur est un vrai
    // blip DB : LÈVE plutôt que de la confondre avec « pas marchand » — sinon un marchand
    // onboardé se voit éjecté par un 401 « Unauthorized » sur son propre écran de jeton
    // (faux positif classe E5). On LÈVE l'objet PostgREST BRUT (pas un `new Error` qui
    // écraserait le diagnostic) → `captureError` (branche objet, leçon E4) préserve
    // `code/details/hint` en Sentry, comme les routes sœurs (google/stats, stock/receive).
    if (error && error.code !== "PGRST116") {
        throw error;
    }
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

        const { data: cred, error: credErr } = await admin
            .from("ingest_credentials")
            .select("last_used_at, last_rows, last_status")
            .eq("merchant_id", merchantId)
            .maybeSingle();
        // L'historique (fraîcheur du dernier push) est SECONDAIRE : un blip ne doit pas
        // priver le marchand de son jeton (payload primaire). Mais l'échec ne doit pas non
        // plus être muet (afficher « jamais poussé » à tort) → captureError-et-continue.
        if (credErr) captureError(credErr, { route: "ingest/token", method: "GET", step: "history" });

        return NextResponse.json({ ...pushInfo(token), ...(cred ?? {}) });
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

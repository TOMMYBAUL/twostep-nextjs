import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeGoogleCode, getGoogleMerchantId } from "@/lib/google/merchant";
import { encrypt } from "@/lib/email/encryption";
import { captureError } from "@/lib/error";
import { getSiteUrl } from "@/lib/url";

export async function GET(request: NextRequest) {
    const baseUrl = getSiteUrl();
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
        return NextResponse.redirect(`${baseUrl}/dashboard/google?error=missing_params`);
    }

    const parts = state.split(":");
    if (parts.length < 3 || parts[0] !== "google") {
        return NextResponse.redirect(`${baseUrl}/dashboard/google?error=invalid_state`);
    }

    const merchantId = parts[1];
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.redirect(`${baseUrl}/dashboard/google?error=auth_required`);
    }

    const { data: ownedMerchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("id", merchantId)
        .eq("user_id", user.id)
        .single();

    if (!ownedMerchant) {
        return NextResponse.redirect(`${baseUrl}/dashboard/google?error=forbidden`);
    }

    try {
        const tokens = await exchangeGoogleCode(code);
        const googleMerchantId = await getGoogleMerchantId(tokens.access_token);

        await supabase
            .from("google_merchant_connections")
            .upsert({
                merchant_id: merchantId,
                google_merchant_id: googleMerchantId,
                access_token: encrypt(tokens.access_token),
                refresh_token: encrypt(tokens.refresh_token),
                expires_at: tokens.expires_at,
                store_code: `twostep-${merchantId.slice(0, 8)}`,
            }, { onConflict: "merchant_id" });

        return NextResponse.redirect(`${baseUrl}/dashboard/google?connected=true`);
    } catch (err) {
        captureError(err, { route: "google/callback", merchantId });
        return NextResponse.redirect(`${baseUrl}/dashboard/google?error=oauth_failed`);
    }
}

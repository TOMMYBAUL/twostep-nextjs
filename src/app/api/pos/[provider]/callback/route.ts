import { after, NextRequest, NextResponse } from "next/server";

import { verifyState } from "@/lib/auth/state-token";
import { createClient } from "@/lib/supabase/server";
import { getAdapter, POS_PROVIDERS, type POSProvider } from "@/lib/pos/index";
import { encrypt } from "@/lib/email/encryption";
import { syncMerchantPOS } from "@/lib/pos/sync-engine";
import { captureError } from "@/lib/error";
import { getSiteUrl } from "@/lib/url";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> },
) {
    const baseUrl = getSiteUrl();
    const { provider } = await params;

    if (!POS_PROVIDERS.includes(provider as POSProvider)) {
        return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=unknown_provider`);
    }

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
        return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=missing_params`);
    }

    // Verify HMAC signature on state to prevent CSRF
    const verifiedPayload = verifyState(state);
    if (!verifiedPayload) {
        return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=invalid_state`);
    }

    // State payload format: {provider}:{merchantId}
    const colonIdx = verifiedPayload.indexOf(":");
    if (colonIdx === -1) {
        return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=invalid_state`);
    }

    const stateProvider = verifiedPayload.slice(0, colonIdx);
    const merchantId = verifiedPayload.slice(colonIdx + 1);

    // Verify state provider matches URL provider
    if (stateProvider !== provider) {
        return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=provider_mismatch`);
    }

    const supabase = await createClient();

    // Verify merchant belongs to authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        const errorUrl = new URL("/dashboard/settings", request.nextUrl.origin);
        errorUrl.searchParams.set("error", "auth_required");
        return NextResponse.redirect(errorUrl);
    }

    const { data: ownedMerchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("id", merchantId)
        .eq("user_id", user.id)
        .single();

    if (!ownedMerchant) {
        const errorUrl = new URL("/dashboard/settings", request.nextUrl.origin);
        errorUrl.searchParams.set("error", "forbidden");
        return NextResponse.redirect(errorUrl);
    }

    try {
        const adapter = getAdapter(provider);

        // Extract shop_domain for Shopify from callback params
        const shopDomain = provider === "shopify"
            ? request.nextUrl.searchParams.get("shop") ?? null
            : null;

        const tokens = await adapter.exchangeCode(code, shopDomain ? { shop: shopDomain } : undefined);

        // Store in pos_connections table
        const { error: connError } = await supabase
            .from("pos_connections")
            .upsert({
                merchant_id: merchantId,
                provider,
                access_token: encrypt(tokens.access_token),
                refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
                expires_at: tokens.expires_at,
                shop_domain: shopDomain,
            }, { onConflict: "merchant_id,provider" });

        if (connError) {
            captureError(connError, { route: `pos/${provider}/callback`, merchantId });
            return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed`);
        }

        // Update merchant pos_type
        await supabase
            .from("merchants")
            .update({ pos_type: provider })
            .eq("id", merchantId);

        // Trigger first sync (non-blocking — runs after response is sent)
        after(async () => {
            try {
                await syncMerchantPOS(merchantId, provider);
            } catch (syncErr) {
                captureError(syncErr, { route: `pos/${provider}/callback`, merchantId, phase: "first_sync" });
            }
        });

        return NextResponse.redirect(`${baseUrl}/dashboard/settings?pos=connected`);
    } catch (err) {
        captureError(err, { route: `pos/${provider}/callback`, merchantId });
        return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=oauth_failed`);
    }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gmailProvider } from "@/lib/email/gmail";
import { outlookProvider } from "@/lib/email/outlook";
import { encrypt } from "@/lib/email/encryption";
import { verifyState } from "@/lib/auth/state-token";

/**
 * OAuth callback — Google/Microsoft redirects here after user consent.
 * Receives ?code=xxx&state=merchantId (Gmail) or &state=provider:merchantId (Outlook)
 * Exchanges the code for tokens, stores them encrypted, redirects to dashboard.
 */
export async function GET(request: NextRequest) {
    const url = request.nextUrl;
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? "";
    const error = url.searchParams.get("error");

    // User denied consent
    if (error) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?email_error=consent_denied", request.url)
        );
    }

    if (!code || !state) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?email_error=missing_params", request.url)
        );
    }

    // Verify HMAC signature on state to prevent CSRF
    const verified = verifyState(state);
    if (!verified) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?email_error=invalid_state", request.url)
        );
    }

    // Determine provider from state format: "merchantId" (Gmail) or "outlook:merchantId" (Outlook)
    let provider: "gmail" | "outlook";
    let merchantId: string;

    if (verified.startsWith("outlook:")) {
        provider = "outlook";
        merchantId = verified.replace("outlook:", "");
    } else {
        provider = "gmail";
        merchantId = verified;
    }

    try {
        const supabase = createAdminClient();

        // Verify merchant exists
        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("id", merchantId)
            .single();

        if (!merchant) {
            return NextResponse.redirect(
                new URL("/dashboard/settings?email_error=merchant_not_found", request.url)
            );
        }

        // Exchange code for tokens
        let tokens: { access_token: string; refresh_token: string | null; email_address: string };

        if (provider === "gmail") {
            tokens = await gmailProvider.exchangeCode(code);
        } else {
            tokens = await outlookProvider.exchangeCode(code);
        }

        // Store encrypted tokens
        await supabase.from("email_connections").upsert({
            merchant_id: merchantId,
            provider,
            access_token: encrypt(tokens.access_token),
            refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
            email_address: tokens.email_address,
            status: "active",
        });

        // Redirect to settings with success
        return NextResponse.redirect(
            new URL(`/dashboard/settings?email_connected=${encodeURIComponent(tokens.email_address)}`, request.url)
        );
    } catch (err) {
        console.error("[email-callback] Error exchanging code:", err);
        return NextResponse.redirect(
            new URL("/dashboard/settings?email_error=exchange_failed", request.url)
        );
    }
}

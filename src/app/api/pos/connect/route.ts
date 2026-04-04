import { NextRequest, NextResponse } from "next/server";

import { verifyState } from "@/lib/auth/state-token";
import { getSiteUrl } from "@/lib/url";

/**
 * Legacy connect route — kept for backwards compatibility.
 * Redirects OAuth callbacks to the new /api/pos/[provider]/callback route.
 * Frontend should use /api/pos/[provider]/auth for new connections.
 */
export async function GET(request: NextRequest) {
    const baseUrl = getSiteUrl();
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

    const provider = verifiedPayload.slice(0, colonIdx);

    // Forward all query params to the new callback route
    const params = new URLSearchParams(request.nextUrl.searchParams);
    return NextResponse.redirect(`${baseUrl}/api/pos/${provider}/callback?${params}`);
}

import { NextRequest, NextResponse } from "next/server";

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

    // State format: {provider}:{merchantId}
    const colonIdx = state.indexOf(":");
    if (colonIdx === -1) {
        return NextResponse.redirect(`${baseUrl}/dashboard/settings?error=invalid_state`);
    }

    const provider = state.slice(0, colonIdx);

    // Forward all query params to the new callback route
    const params = new URLSearchParams(request.nextUrl.searchParams);
    return NextResponse.redirect(`${baseUrl}/api/pos/${provider}/callback?${params}`);
}

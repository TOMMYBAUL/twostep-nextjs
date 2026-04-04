import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
    // Auth session refresh for protected API routes
    const { updateSession } = await import("@/lib/supabase/middleware");
    return await updateSession(request);
}

export const config = {
    matcher: [
        // Blocked pages (consumer + dashboard + auth)
        "/explore/:path*", "/discover/:path*", "/search/:path*", "/shop/:path*",
        "/product/:path*", "/favorites/:path*", "/profile/:path*",
        "/dashboard/:path*", "/admin/:path*", "/auth/:path*",
        // All API routes — public exceptions handled inside updateSession
        "/api/:path*",
    ],
};

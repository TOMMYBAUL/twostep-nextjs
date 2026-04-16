import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
    // Auth session refresh for protected API routes
    const { updateSession } = await import("@/lib/supabase/middleware");
    return await updateSession(request);
}

export const config = {
    matcher: [
        // Protected pages only — consumer pages are public, no middleware needed
        "/favorites/:path*", "/profile/:path*",
        "/dashboard/:path*", "/admin/:path*", "/auth/:path*",
        // API routes — private routes checked inside updateSession
        "/api/:path*",
    ],
};

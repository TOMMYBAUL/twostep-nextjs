import { type NextRequest, NextResponse } from "next/server";

// Pages blocked in production — app not ready yet, only the landing page is public
const BLOCKED_PAGES = ["/explore", "/discover", "/search", "/shop", "/product", "/favorites", "/profile", "/dashboard", "/admin", "/auth"];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Demo mode: skip ALL protection in development
    if (
        process.env.NEXT_PUBLIC_DEMO_MODE === "true" &&
        process.env.NODE_ENV === "development"
    ) {
        return NextResponse.next();
    }

    // Block consumer app + merchant dashboard in production → redirect to landing
    if (BLOCKED_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
        return NextResponse.redirect(new URL("/", request.url));
    }

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
        // Protected API routes
        "/api/pos/:path*", "/api/email/:path*", "/api/invoices/:path*",
        "/api/stripe/:path*", "/api/favorites/:path*", "/api/follows/:path*",
        "/api/admin/:path*",
    ],
};

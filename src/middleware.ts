import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
    // Demo mode: skip auth ONLY in development — never in production
    if (
        process.env.NEXT_PUBLIC_DEMO_MODE === "true" &&
        process.env.NODE_ENV === "development"
    ) {
        return NextResponse.next();
    }
    // Dynamic import to avoid Turbopack compilation issues with @supabase/ssr
    const { updateSession } = await import("@/lib/supabase/middleware");
    return await updateSession(request);
}

export const config = {
    matcher: ["/dashboard/:path*", "/admin/:path*", "/auth/:path*", "/api/pos/:path*", "/api/email/:path*", "/api/invoices/:path*", "/api/stripe/:path*", "/api/favorites/:path*", "/api/follows/:path*", "/api/admin/:path*"],
};

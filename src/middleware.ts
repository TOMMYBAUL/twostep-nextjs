import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
    // Demo mode: skip auth ONLY in development — never in production
    if (
        process.env.NEXT_PUBLIC_DEMO_MODE === "true" &&
        process.env.NODE_ENV === "development"
    ) {
        return NextResponse.next();
    }
    return await updateSession(request);
}

export const config = {
    matcher: ["/dashboard/:path*", "/admin/:path*", "/auth/:path*", "/api/merchants/:path*", "/api/nearby", "/api/products/:path*", "/api/stock/:path*", "/api/promotions/:path*", "/api/pos/:path*", "/api/email/:path*", "/api/invoices/:path*", "/api/feed/:path*", "/api/stripe/:path*", "/api/favorites/:path*", "/api/follows/:path*", "/api/autocomplete", "/api/admin/:path*"],
};

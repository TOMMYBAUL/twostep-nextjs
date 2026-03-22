import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
    // Demo mode: skip auth, let all routes through
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
        return NextResponse.next();
    }
    return await updateSession(request);
}

export const config = {
    matcher: ["/dashboard/:path*", "/auth/:path*", "/api/merchants/:path*", "/api/products/:path*", "/api/stock/:path*", "/api/promotions/:path*", "/api/pos/:path*", "/api/email/:path*", "/api/invoices/:path*", "/api/feed/:path*", "/api/stripe/:path*", "/api/favorites/:path*", "/api/follows/:path*", "/api/autocomplete"],
};

import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
    return await updateSession(request);
}

export const config = {
    matcher: ["/dashboard/:path*", "/auth/:path*", "/api/merchants/:path*", "/api/products/:path*", "/api/stock/:path*", "/api/promotions/:path*", "/api/pos/:path*", "/api/email/:path*", "/api/invoices/:path*", "/api/feed/:path*", "/api/stripe/:path*"],
};

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Routes that REQUIRE authentication.
 * Everything else is public by default.
 * Each private route's handler also checks auth internally (defense in depth).
 */
const PRIVATE_API_PREFIXES = [
    "/api/admin",            // Admin operations
    "/api/catalog/import",   // Merchant catalog import
    "/api/categorize",       // AI categorization (merchant action)
    "/api/consumer/",        // Consumer preferences (requires login)
    "/api/email/",           // Email connection management
    "/api/favorites",        // User favorites (requires login)
    "/api/follows",          // User follows (requires login)
    "/api/google/",          // Google Merchant integration
    "/api/images/",          // Image processing (merchant action)
    "/api/invoices",         // Invoice management (merchant action)
    "/api/pos/",             // POS connection/sync
    "/api/promotions",       // Promotion management
    "/api/push/",            // Push notification subscription
    "/api/stock",            // Stock management
];

function isPrivateApi(pathname: string): boolean {
    return PRIVATE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

    try {
        const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
                },
            },
        });

        const {
            data: { user },
        } = await supabase.auth.getUser();

        const pathname = request.nextUrl.pathname;

        if (!user) {
            // Block private API routes for unauthenticated users
            if (pathname.startsWith("/api/") && isPrivateApi(pathname)) {
                return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                });
            }

            // Redirect unauthenticated users trying to access /dashboard or /admin pages
            if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
                const url = request.nextUrl.clone();
                url.pathname = "/auth/login";
                return NextResponse.redirect(url);
            }
        }

        // Dashboard protection: require merchant profile
        if (user && pathname.startsWith("/dashboard")) {
            const { data: merchant } = await supabase
                .from("merchants")
                .select("id")
                .eq("user_id", user.id)
                .single();

            if (!merchant) {
                const url = request.nextUrl.clone();
                url.pathname = "/discover";
                return NextResponse.redirect(url);
            }
        }

        // Admin API protection: require admin role
        if (user && pathname.startsWith("/api/admin")) {
            const isAdmin = (user as any).app_metadata?.role === "admin";
            if (!isAdmin) {
                return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
                    status: 403,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }
    } catch {
        // Fail closed ONLY for private API routes
        if (request.nextUrl.pathname.startsWith("/api/") && isPrivateApi(request.nextUrl.pathname)) {
            return new NextResponse(JSON.stringify({ error: "Service unavailable" }), {
                status: 503,
                headers: { "Content-Type": "application/json" },
            });
        }
        return NextResponse.next({ request });
    }

    return supabaseResponse;
}

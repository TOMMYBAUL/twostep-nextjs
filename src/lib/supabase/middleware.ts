import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

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
            // Return 401 JSON for unauthenticated API calls
            if (pathname.startsWith("/api/")) {
                return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                });
            }

            // Redirect unauthenticated users trying to access /dashboard or /admin
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

        // Admin API protection: require admin role (pages are checked client-side in admin layout)
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
        // If middleware fails, let the request through — route handlers have their own auth
        return NextResponse.next({ request });
    }

    return supabaseResponse;
}

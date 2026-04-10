import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next");

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            // If a "next" param was provided (e.g. password reset → /auth/reset-password),
            // redirect there instead of the default destination.
            if (next && next.startsWith("/")) {
                return NextResponse.redirect(`${origin}${next}`);
            }

            // Default: check if user is a merchant → dashboard, otherwise → discover
            const { data: { user } } = await supabase.auth.getUser();
            let dest = "/discover";
            if (user) {
                const { data: merchant } = await supabase
                    .from("merchants")
                    .select("id")
                    .eq("user_id", user.id)
                    .single();
                if (merchant) dest = "/dashboard";
            }
            return NextResponse.redirect(`${origin}${dest}`);
        }
    }

    // If no code or exchange failed, redirect to login
    return NextResponse.redirect(`${origin}/auth/login`);
}

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createMerchantFromMetadata } from "@/lib/auth/create-merchant-from-metadata";

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next");

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) await createMerchantFromMetadata(supabase, user);

            if (next && next.startsWith("/")) {
                return NextResponse.redirect(`${origin}${next}`);
            }

            let dest = "/discover";
            if (user) {
                const { data: merchant } = await supabase
                    .from("merchants")
                    .select("id")
                    .eq("user_id", user.id)
                    .maybeSingle();
                if (merchant) dest = "/dashboard";
            }
            return NextResponse.redirect(`${origin}${dest}`);
        }
        return NextResponse.redirect(`${origin}/auth/error?reason=${encodeURIComponent(error.message)}`);
    }

    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
}

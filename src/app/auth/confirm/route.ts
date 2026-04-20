import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createMerchantFromMetadata } from "@/lib/auth/create-merchant-from-metadata";

// Handles the token_hash email confirmation flow (Supabase SSR default).
// Complements /auth/callback which handles the PKCE code flow.
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;
    const next = searchParams.get("next");

    if (token_hash && type) {
        const supabase = await createClient();
        const { error } = await supabase.auth.verifyOtp({ type, token_hash });
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
                    .select("id, billing_status")
                    .eq("user_id", user.id)
                    .maybeSingle();
                if (merchant) {
                    const needsBilling =
                        !merchant.billing_status ||
                        merchant.billing_status === "pending" ||
                        merchant.billing_status === "canceled";
                    dest = needsBilling ? "/auth/billing" : "/dashboard";
                }
            }
            return NextResponse.redirect(`${origin}${dest}`);
        }
        return NextResponse.redirect(`${origin}/auth/error?reason=${encodeURIComponent(error.message)}`);
    }

    return NextResponse.redirect(`${origin}/auth/error?reason=missing_params`);
}

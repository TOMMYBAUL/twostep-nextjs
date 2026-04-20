import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createMerchantFromMetadata } from "@/lib/auth/create-merchant-from-metadata";

// Finalize a signup that came back via the hash-fragment flow (Supabase
// default email template). The client-side AuthHashRescue has already
// called setSession to install the cookies; here we run the merchant
// creation and compute the right redirect — same logic as /auth/callback.
export async function GET(request: NextRequest) {
    const { origin } = new URL(request.url);
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.redirect(`${origin}/auth/error?reason=no_session`);
    }

    await createMerchantFromMetadata(supabase, user);

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id, billing_status")
        .eq("user_id", user.id)
        .maybeSingle();

    let dest = "/discover";
    if (merchant) {
        const needsBilling =
            !merchant.billing_status ||
            merchant.billing_status === "pending" ||
            merchant.billing_status === "canceled";
        dest = needsBilling ? "/auth/billing" : "/dashboard";
    }

    return NextResponse.redirect(`${origin}${dest}`);
}

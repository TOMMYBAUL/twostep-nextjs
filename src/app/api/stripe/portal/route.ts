import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { getSiteUrl } from "@/lib/url";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "stripe-portal", 5);
    if (limited) return limited;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: merchant } = await supabase
            .from("merchants")
            .select("stripe_customer_id")
            .eq("user_id", user.id)
            .single();

        if (!merchant?.stripe_customer_id) {
            return NextResponse.json({ error: "No Stripe customer" }, { status: 400 });
        }

        const stripe = getStripe();
        const session = await stripe.billingPortal.sessions.create({
            customer: merchant.stripe_customer_id,
            return_url: `${getSiteUrl()}/dashboard/settings`,
        });

        return NextResponse.json({ url: session.url });
    } catch {
        return NextResponse.json({ error: "Portal creation failed" }, { status: 500 });
    }
}

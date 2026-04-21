import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { PLANS, claimSignupSlot, TRIAL_DAYS } from "@/lib/stripe/plans";
import { rateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/url";

export async function POST(request: NextRequest) {
    const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "stripe-checkout", 5);
    if (limited) return limited;

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const admin = createAdminClient();
        const { data: merchant } = await admin
            .from("merchants")
            .select("id, stripe_customer_id, billing_status, plan")
            .eq("user_id", user.id)
            .maybeSingle();

        if (!merchant) {
            return NextResponse.json({ error: "Merchant not found" }, { status: 400 });
        }

        if (merchant.billing_status === "active" || merchant.billing_status === "trialing") {
            return NextResponse.json({ error: "Already subscribed" }, { status: 400 });
        }

        const { tier } = await claimSignupSlot(merchant.id);
        const planConfig = PLANS[tier];

        if (!planConfig.stripePriceId) {
            return NextResponse.json({ error: "Stripe price not configured" }, { status: 500 });
        }

        const stripe = getStripe();
        const origin = getSiteUrl();

        let customerId = merchant.stripe_customer_id;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { user_id: user.id, merchant_id: merchant.id },
            });
            customerId = customer.id;
            await admin
                .from("merchants")
                .update({ stripe_customer_id: customerId })
                .eq("id", merchant.id);
        }

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
            subscription_data: {
                trial_period_days: TRIAL_DAYS,
                metadata: {
                    user_id: user.id,
                    merchant_id: merchant.id,
                    plan: tier,
                },
            },
            payment_method_collection: "always",
            success_url: `${origin}/auth/billing/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/auth/billing?canceled=1`,
            metadata: {
                user_id: user.id,
                merchant_id: merchant.id,
                plan: tier,
            },
        });

        return NextResponse.json({ url: session.url, tier });
    } catch (err) {
        console.error("[stripe/checkout] failed", err);
        return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
    }
}

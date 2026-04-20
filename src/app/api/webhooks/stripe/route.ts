import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import type { PlanTier } from "@/lib/stripe/plans";

type MerchantBillingStatus =
    | "pending"
    | "trialing"
    | "active"
    | "payment_required"
    | "canceled";

const stripeStatusToBillingStatus = (
    status: Stripe.Subscription.Status,
): MerchantBillingStatus => {
    switch (status) {
        case "trialing":
            return "trialing";
        case "active":
            return "active";
        case "past_due":
        case "unpaid":
            return "payment_required";
        case "canceled":
        case "incomplete_expired":
            return "canceled";
        case "incomplete":
        case "paused":
        default:
            return "pending";
    }
};

const getPlanFromSubscription = (sub: Stripe.Subscription): PlanTier | null => {
    const priceId = sub.items.data[0]?.price.id;
    if (!priceId) return null;
    if (priceId === process.env.STRIPE_PIONEER_PRICE_ID) return "pioneer";
    if (priceId === process.env.STRIPE_EARLY_PRICE_ID) return "early";
    if (priceId === process.env.STRIPE_STANDARD_PRICE_ID) return "standard";
    return null;
};

// In Stripe API 2025-03-31+ / SDK v18+, current_period_end moved from
// Subscription to each SubscriptionItem. We read the first item's value.
const getCurrentPeriodEnd = (sub: Stripe.Subscription): number | null => {
    return sub.items.data[0]?.current_period_end ?? null;
};

export async function POST(request: NextRequest) {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature") ?? "";

    const stripe = getStripe();
    let event: Stripe.Event;

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET,
        );
    } catch (err) {
        console.error("[webhook/stripe] bad signature", err);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error: dupErr } = await supabase
        .from("webhook_events")
        .insert({ webhook_id: event.id, provider: "stripe" });
    if (dupErr && dupErr.code === "23505") {
        return NextResponse.json({ received: true, duplicate: true });
    }

    try {
        switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated": {
                const sub = event.data.object as Stripe.Subscription;
                const customerId =
                    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
                const plan = getPlanFromSubscription(sub);
                const billingStatus = stripeStatusToBillingStatus(sub.status);

                const periodEnd = getCurrentPeriodEnd(sub);
                const update: Record<string, unknown> = {
                    billing_status: billingStatus,
                    stripe_subscription_id: sub.id,
                    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
                    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
                };
                if (plan) update.plan = plan;

                await supabase
                    .from("merchants")
                    .update(update)
                    .eq("stripe_customer_id", customerId);
                break;
            }

            case "customer.subscription.deleted": {
                const sub = event.data.object as Stripe.Subscription;
                const customerId =
                    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
                const periodEnd = getCurrentPeriodEnd(sub);
                await supabase
                    .from("merchants")
                    .update({
                        billing_status: "canceled",
                        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
                    })
                    .eq("stripe_customer_id", customerId);
                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;
                const customerId =
                    typeof invoice.customer === "string"
                        ? invoice.customer
                        : invoice.customer?.id;
                if (customerId) {
                    await supabase
                        .from("merchants")
                        .update({ billing_status: "payment_required" })
                        .eq("stripe_customer_id", customerId);
                }
                break;
            }

            case "invoice.payment_succeeded": {
                const invoice = event.data.object as Stripe.Invoice;
                const customerId =
                    typeof invoice.customer === "string"
                        ? invoice.customer
                        : invoice.customer?.id;
                if (customerId) {
                    await supabase
                        .from("merchants")
                        .update({ billing_status: "active" })
                        .eq("stripe_customer_id", customerId)
                        .eq("billing_status", "payment_required");
                }
                break;
            }
        }
    } catch (err) {
        console.error("[webhook/stripe] handler error", event.type, err);
        return NextResponse.json({ error: "Handler error" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}

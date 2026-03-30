import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";

export async function POST(request: NextRequest) {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature") ?? "";

    const stripe = getStripe();
    let event;

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const supabase = createAdminClient();

    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object;
            const userId = session.metadata?.user_id;
            const plan = session.metadata?.plan;
            if (userId && plan) {
                await supabase
                    .from("merchants")
                    .update({ plan })
                    .eq("user_id", userId);
            }
            break;
        }
        case "customer.subscription.deleted": {
            const sub = event.data.object as any;
            const customerId = sub.customer as string;
            if (customerId) {
                await supabase
                    .from("merchants")
                    .update({ plan: "free" })
                    .eq("stripe_customer_id", customerId);
            }
            break;
        }
    }

    return NextResponse.json({ received: true });
}

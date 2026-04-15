import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { PLANS, isBillingActive } from "@/lib/stripe/plans";

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await isBillingActive())) {
        return NextResponse.json({ error: "Billing not yet active" }, { status: 400 });
    }

    const body = await request.json();
    const plan = body.plan as string;
    if (!(plan in PLANS)) {
        return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    const validPlan = plan as keyof typeof PLANS;

    const stripe = getStripe();
    const planConfig = PLANS[validPlan];
    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: user.email,
        line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
        success_url: `${request.nextUrl.origin}/dashboard/settings?billing=success`,
        cancel_url: `${request.nextUrl.origin}/dashboard/settings?billing=cancel`,
        metadata: { user_id: user.id, plan },
    });

    return NextResponse.json({ url: session.url });
}

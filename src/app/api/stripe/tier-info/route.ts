import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLANS, resolveTierForNextSignup, TRIAL_DAYS, PIONEER_CAP, EARLY_CAP } from "@/lib/stripe/plans";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { tier, activeCount, remainingInTier } = await resolveTierForNextSignup();
    const plan = PLANS[tier];

    return NextResponse.json({
        tier,
        name: plan.name,
        description: plan.description,
        priceEuros: plan.price / 100,
        activeCount,
        remainingInTier: remainingInTier === Infinity ? null : remainingInTier,
        pioneerCap: PIONEER_CAP,
        earlyCap: EARLY_CAP,
        trialDays: TRIAL_DAYS,
    });
}

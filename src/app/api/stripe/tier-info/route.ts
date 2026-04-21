import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
    PLANS,
    resolveTierForNextSignup,
    tierFromRank,
    TRIAL_DAYS,
    PIONEER_CAP,
    EARLY_CAP,
} from "@/lib/stripe/plans";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // If the user's merchant already has a rank (they clicked "Démarrer" before),
    // show the tier they already hold instead of "what the next signup would get".
    // Prevents the misleading "Tu seras le 2ᵉ marchand" shown to someone who's
    // already rank 1.
    const { data: merchant } = await supabase
        .from("merchants")
        .select("signup_order_rank")
        .eq("user_id", user.id)
        .maybeSingle();

    const existingRank =
        (merchant?.signup_order_rank as number | null | undefined) ?? null;

    if (existingRank !== null) {
        const tier = tierFromRank(existingRank);
        const plan = PLANS[tier];
        let remainingInTier: number | null;
        if (tier === "pioneer") remainingInTier = PIONEER_CAP - existingRank;
        else if (tier === "early") remainingInTier = EARLY_CAP - existingRank;
        else remainingInTier = null;

        return NextResponse.json({
            tier,
            name: plan.name,
            description: plan.description,
            priceEuros: plan.price / 100,
            activeCount: existingRank,
            remainingInTier,
            pioneerCap: PIONEER_CAP,
            earlyCap: EARLY_CAP,
            trialDays: TRIAL_DAYS,
            alreadyClaimed: true,
        });
    }

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
        alreadyClaimed: false,
    });
}

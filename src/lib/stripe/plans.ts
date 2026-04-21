import { createAdminClient } from "@/lib/supabase/admin";

export const PLANS = {
    pioneer: {
        name: "Pionnier",
        price: 1900,
        stripePriceId: process.env.STRIPE_PIONEER_PRICE_ID ?? "",
        description: "Réservé aux 30 premiers marchands — verrouillé à vie",
    },
    early: {
        name: "Early Adopter",
        price: 2900,
        stripePriceId: process.env.STRIPE_EARLY_PRICE_ID ?? "",
        description: "Marchands 31 à 50 — verrouillé à vie",
    },
    standard: {
        name: "Standard",
        price: 3900,
        stripePriceId: process.env.STRIPE_STANDARD_PRICE_ID ?? "",
        description: "Tarif standard à partir du 51ᵉ marchand",
    },
} as const;

export type PlanTier = keyof typeof PLANS;

export const PIONEER_CAP = 30;
export const EARLY_CAP = 50;
export const TRIAL_DAYS = 30;

export function tierFromRank(rank: number): PlanTier {
    if (rank <= PIONEER_CAP) return "pioneer";
    if (rank <= EARLY_CAP) return "early";
    return "standard";
}

/**
 * Read-only: what the UI shows before the merchant commits. Computes the tier
 * the NEXT signup would land in, based on the highest rank already claimed.
 * Ranks are historical — cancellations do NOT free slots.
 */
export async function resolveTierForNextSignup(): Promise<{
    tier: PlanTier;
    activeCount: number;
    remainingInTier: number;
}> {
    const supabase = createAdminClient();

    const { data } = await supabase
        .from("merchants")
        .select("signup_order_rank")
        .not("signup_order_rank", "is", null)
        .order("signup_order_rank", { ascending: false })
        .limit(1);

    const lastRank =
        (data?.[0]?.signup_order_rank as number | null | undefined) ?? 0;
    const nextRank = lastRank + 1;
    const tier = tierFromRank(nextRank);

    let remainingInTier: number;
    if (tier === "pioneer") remainingInTier = PIONEER_CAP - lastRank;
    else if (tier === "early") remainingInTier = EARLY_CAP - lastRank;
    else remainingInTier = Infinity;

    return { tier, activeCount: lastRank, remainingInTier };
}

/**
 * Atomic: called from the Stripe checkout route. Assigns a permanent rank
 * to the merchant (idempotent — returns the existing rank if already set)
 * and derives the tier. Protected by a Postgres advisory lock so concurrent
 * checkouts cannot exceed the Pioneer (30) or Early (50) caps.
 */
export async function claimSignupSlot(merchantId: string): Promise<{
    tier: PlanTier;
    rank: number;
}> {
    const supabase = createAdminClient();
    const { data: rank, error } = await supabase.rpc("claim_signup_slot", {
        p_merchant_id: merchantId,
    });
    if (error) throw error;
    if (typeof rank !== "number") {
        throw new Error("claim_signup_slot returned non-number");
    }
    return { tier: tierFromRank(rank), rank };
}

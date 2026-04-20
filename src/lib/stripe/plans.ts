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

/**
 * Determine which tier a new merchant should be offered based on how many
 * merchants already have an active subscription (trialing or active).
 */
export async function resolveTierForNextSignup(): Promise<{
    tier: PlanTier;
    activeCount: number;
    remainingInTier: number;
}> {
    const supabase = createAdminClient();

    const { count } = await supabase
        .from("merchants")
        .select("id", { count: "exact", head: true })
        .in("billing_status", ["trialing", "active"]);

    const activeCount = count ?? 0;

    if (activeCount < PIONEER_CAP) {
        return {
            tier: "pioneer",
            activeCount,
            remainingInTier: PIONEER_CAP - activeCount,
        };
    }
    if (activeCount < EARLY_CAP) {
        return {
            tier: "early",
            activeCount,
            remainingInTier: EARLY_CAP - activeCount,
        };
    }
    return {
        tier: "standard",
        activeCount,
        remainingInTier: Infinity,
    };
}

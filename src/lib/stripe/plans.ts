import { createAdminClient } from "@/lib/supabase/admin";

export const PLANS = {
    pioneer: {
        name: "Pionnier",
        price: 1900, // cents — 30 premiers marchands
        stripePriceId: process.env.STRIPE_PIONEER_PRICE_ID ?? "",
    },
    early: {
        name: "Early Adopter",
        price: 2900, // cents — marchands 31 à 50
        stripePriceId: process.env.STRIPE_EARLY_PRICE_ID ?? "",
    },
    standard: {
        name: "Standard",
        price: 3900, // cents — à partir du 51e
        stripePriceId: process.env.STRIPE_STANDARD_PRICE_ID ?? "",
    },
} as const;

/**
 * Check if billing should be enabled.
 * Returns true when: toulouse_users_count >= 1000 AND launch_date + 6 months.
 */
export async function isBillingActive(): Promise<boolean> {
    const supabase = createAdminClient();

    const { data: metrics } = await supabase
        .from("platform_metrics")
        .select("key, value")
        .in("key", ["toulouse_users_count", "launch_date"]);

    const usersCount = metrics?.find((m) => m.key === "toulouse_users_count")?.value ?? 0;
    const launchTimestamp = metrics?.find((m) => m.key === "launch_date")?.value ?? 0;

    if (usersCount < 1000) return false;
    if (launchTimestamp === 0) return false;

    const launchDate = new Date(launchTimestamp * 1000);
    const sixMonthsLater = new Date(launchDate);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    return new Date() >= sixMonthsLater;
}

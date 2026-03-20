import { createAdminClient } from "@/lib/supabase/admin";

export const PLANS = {
    standard: {
        name: "Standard",
        price: 2900, // cents
        stripePriceId: process.env.STRIPE_STANDARD_PRICE_ID ?? "",
    },
    premium: {
        name: "Premium",
        price: 4900,
        stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID ?? "",
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

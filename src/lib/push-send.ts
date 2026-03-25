/**
 * Server-side push notification sender.
 * Uses web-push to send notifications to subscribed users.
 */

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = `mailto:contact@twostep.fr`;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

type PushPayload = {
    title: string;
    body: string;
    url?: string;
};

/**
 * Send a push notification to a specific user.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
    const supabase = createAdminClient();
    const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("id, subscription")
        .eq("user_id", userId);

    if (!subscriptions || subscriptions.length === 0) return 0;

    let sent = 0;
    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
            sent++;
        } catch (err: any) {
            // 410 Gone or 404 = subscription expired, clean up
            if (err.statusCode === 410 || err.statusCode === 404) {
                await supabase.from("push_subscriptions").delete().eq("id", sub.id);
            } else {
                captureError(err, { userId, subscriptionId: sub.id });
            }
        }
    }
    return sent;
}

/**
 * Send a push notification to all followers of a merchant.
 */
export async function notifyMerchantFollowers(
    merchantId: string,
    payload: PushPayload,
): Promise<number> {
    const supabase = createAdminClient();
    const { data: follows } = await supabase
        .from("user_follows")
        .select("user_id")
        .eq("merchant_id", merchantId);

    if (!follows || follows.length === 0) return 0;

    let totalSent = 0;
    for (const follow of follows) {
        totalSent += await sendPushToUser(follow.user_id, payload);
    }
    return totalSent;
}

/**
 * Send a push notification to all users who favorited a product.
 */
export async function notifyProductFavorites(
    productId: string,
    payload: PushPayload,
): Promise<number> {
    const supabase = createAdminClient();
    const { data: favorites } = await supabase
        .from("user_favorites")
        .select("user_id")
        .eq("product_id", productId);

    if (!favorites || favorites.length === 0) return 0;

    let totalSent = 0;
    for (const fav of favorites) {
        totalSent += await sendPushToUser(fav.user_id, payload);
    }
    return totalSent;
}

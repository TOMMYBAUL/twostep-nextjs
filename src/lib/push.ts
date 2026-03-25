/**
 * Client-side push notification helpers.
 * Uses the Web Push API to subscribe/unsubscribe from push notifications.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Subscribe to push notifications.
 * Returns the PushSubscription or null if permission denied.
 */
export async function subscribePush(): Promise<PushSubscription | null> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    if (!VAPID_PUBLIC_KEY) return null;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });

    // Send subscription to server
    await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
    });

    return subscription;
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribePush(): Promise<void> {
    if (!("serviceWorker" in navigator)) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    // Remove from server
    await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    await subscription.unsubscribe();
}

/**
 * Check if currently subscribed to push.
 */
export async function isPushSubscribed(): Promise<boolean> {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
}

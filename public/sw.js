/**
 * Two-Step Service Worker — Offline-first caching for PWA
 * Bump CACHE_VERSION on each deploy to bust stale caches.
 */

const CACHE_VERSION = 9;
const CACHE_NAME = `twostep-v${CACHE_VERSION}`;

// Static assets to pre-cache on install
const PRECACHE_URLS = [
    "/explore",
    "/offline.html",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/logo-icon.webp",
];

// Install: pre-cache shell + offline page
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
    );
    self.skipWaiting();
});

// Activate: clean old caches (any that don't match current version)
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
            ),
        ),
    );
    self.clients.claim();
});

// Fetch: network-first for pages, cache-first for static assets
self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== "GET") return;

    // Skip API calls and auth routes — always go to network
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

    // For navigation requests: network-first with offline fallback
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() =>
                    caches.match(request).then((cached) => cached || caches.match("/offline.html")),
                ),
        );
        return;
    }

    // For static assets: cache-first
    if (
        url.pathname.startsWith("/icons/") ||
        url.pathname.startsWith("/_next/static/") ||
        url.pathname.endsWith(".webp") ||
        url.pathname.endsWith(".png") ||
        url.pathname.endsWith(".woff2")
    ) {
        event.respondWith(
            caches.match(request).then(
                (cached) =>
                    cached ||
                    fetch(request).then((response) => {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                        return response;
                    }),
            ),
        );
        return;
    }
});

// Push notifications
self.addEventListener("push", (event) => {
    const defaultData = { title: "Two-Step", body: "Nouvelle notification", url: "/explore" };
    let data = defaultData;

    try {
        if (event.data) data = { ...defaultData, ...event.data.json() };
    } catch {
        // fallback to default
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            data: { url: data.url },
            vibrate: [100, 50, 100],
        }),
    );
});

// Notification click: open the target URL
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification.data?.url || "/explore";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if (client.url.includes(url) && "focus" in client) return client.focus();
            }
            return clients.openWindow(url);
        }),
    );
});

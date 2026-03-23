/**
 * Two-Step Service Worker — Offline-first caching for PWA
 */

const CACHE_NAME = "twostep-v1";

// Static assets to pre-cache on install
const PRECACHE_URLS = [
    "/discover",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/logo-icon.webp",
];

// Install: pre-cache shell
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
    );
    self.skipWaiting();
});

// Activate: clean old caches
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

// Fetch: network-first for API, cache-first for static assets
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
                .catch(() => caches.match(request).then((cached) => cached || caches.match("/discover"))),
        );
        return;
    }

    // For static assets (images, fonts, CSS, JS): cache-first
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

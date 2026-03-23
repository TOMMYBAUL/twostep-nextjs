/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding window counter per IP.
 *
 * For production at scale, replace with Redis-backed solution.
 */

const windowMs = 60_000; // 1 minute window
const store = new Map<string, { count: number; resetAt: number }>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (now > entry.resetAt) store.delete(key);
    }
}, 300_000);

/**
 * Check if a request should be rate-limited.
 * @returns null if allowed, or a Response if rate-limited.
 */
export function rateLimit(
    ip: string | null,
    endpoint: string,
    maxRequests: number = 30,
): Response | null {
    const key = `${ip ?? "unknown"}:${endpoint}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return null;
    }

    entry.count++;
    if (entry.count > maxRequests) {
        return new Response(
            JSON.stringify({ error: "Too many requests. Try again later." }),
            {
                status: 429,
                headers: {
                    "Content-Type": "application/json",
                    "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
                },
            },
        );
    }

    return null;
}

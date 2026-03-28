/**
 * Rate limiter with Upstash Redis backend.
 * Falls back to in-memory when UPSTASH_REDIS_REST_URL is not configured (dev).
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------- Upstash (production) ----------

function createUpstashLimiter(maxRequests: number, windowSec: number) {
    const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    return new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
        analytics: true,
        prefix: "twostep",
    });
}

// ---------- In-memory fallback (dev / missing config) ----------

const windowMs = 60_000;
const memStore = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memStore) {
        if (now > entry.resetAt) memStore.delete(key);
    }
}, 300_000);

function memoryLimit(key: string, max: number): Response | null {
    const now = Date.now();
    const entry = memStore.get(key);

    if (!entry || now > entry.resetAt) {
        memStore.set(key, { count: 1, resetAt: now + windowMs });
        return null;
    }

    entry.count++;
    if (entry.count > max) {
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

// ---------- Public API ----------

const useUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

// Cache limiter instances per (maxRequests, window) pair
const limiters = new Map<string, Ratelimit>();

function getLimiter(maxRequests: number, windowSec: number): Ratelimit {
    const key = `${maxRequests}:${windowSec}`;
    let limiter = limiters.get(key);
    if (!limiter) {
        limiter = createUpstashLimiter(maxRequests, windowSec);
        limiters.set(key, limiter);
    }
    return limiter;
}

/**
 * Check if a request should be rate-limited.
 * @returns null if allowed, or a Response if rate-limited.
 */
export async function rateLimit(
    ip: string | null,
    endpoint: string,
    maxRequests: number = 30,
): Promise<Response | null> {
    const identifier = `${ip ?? "unknown"}:${endpoint}`;

    if (!useUpstash) {
        return memoryLimit(identifier, maxRequests);
    }

    try {
        const limiter = getLimiter(maxRequests, 60);
        const { success, reset } = await limiter.limit(identifier);

        if (!success) {
            const retryAfter = Math.ceil((reset - Date.now()) / 1000);
            return new Response(
                JSON.stringify({ error: "Too many requests. Try again later." }),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "Retry-After": String(Math.max(1, retryAfter)),
                    },
                },
            );
        }
    } catch {
        // If Upstash is unreachable, allow the request through
    }

    return null;
}

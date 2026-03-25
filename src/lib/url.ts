/**
 * Returns the base URL for the application.
 * Priority: NEXT_PUBLIC_SITE_URL > VERCEL_URL > localhost fallback.
 *
 * VERCEL_URL is auto-set by Vercel but doesn't include the protocol.
 */
export function getSiteUrl(): string {
    if (process.env.NEXT_PUBLIC_SITE_URL) {
        return process.env.NEXT_PUBLIC_SITE_URL;
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    return "http://localhost:3000";
}

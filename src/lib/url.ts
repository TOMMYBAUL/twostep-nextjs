/**
 * Returns the base URL for the application.
 * Priority: NEXT_PUBLIC_SITE_URL > VERCEL_URL > localhost fallback.
 *
 * VERCEL_URL is auto-set by Vercel but doesn't include the protocol.
 * Env values are .trim()-ed because copy-paste into Vercel's dashboard
 * occasionally adds trailing newlines that silently break URL parsing
 * (Stripe: "success_url: Not a valid URL").
 */
export function getSiteUrl(): string {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (explicit) return explicit;

    const vercel = process.env.VERCEL_URL?.trim();
    if (vercel) return `https://${vercel}`;

    return "http://localhost:3000";
}

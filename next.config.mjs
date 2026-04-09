import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["web-push"],
    images: {
        formats: ["image/avif", "image/webp"],
        localPatterns: [{ pathname: "/**" }],
        remotePatterns: [
            // ── Static / known ────────────────────────────────
            {
                protocol: "https",
                hostname: "images.unsplash.com",
            },
            {
                protocol: "https",
                hostname: "**.supabase.co",
            },
            {
                protocol: "https",
                hostname: "pub-13766eebd79a46e19db13146812e9218.r2.dev",
            },
            // ── POS CDNs ──────────────────────────────────────
            {
                protocol: "https",
                hostname: "cdn.shopify.com",
            },
            {
                protocol: "https",
                hostname: "connect.squareup.com",
            },
            {
                protocol: "https",
                hostname: "connect.squareupsandbox.com",
            },
            {
                protocol: "https",
                hostname: "items-images-production.s3.us-west-2.amazonaws.com", // Square product images
            },
            {
                protocol: "https",
                hostname: "image.izettle.com",
            },
            {
                protocol: "https",
                hostname: "**.lightspeedapp.com",
            },
            {
                protocol: "https",
                hostname: "**.fastmag.fr",
            },
            // ── Google ────────────────────────────────────────
            {
                protocol: "https",
                hostname: "lh3.googleusercontent.com",
            },
            // ── EAN / UPCitemdb / OpenEAN — images come from
            //    any retailer domain, so we allow all HTTPS ───
            {
                protocol: "https",
                hostname: "**",
            },
        ],
    },
    experimental: {
        optimizePackageImports: [
            "@untitledui/icons",
            "react-aria-components",
            "motion",
            "recharts",
        ],
    },
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
                    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
                    { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.mapbox.com https://*.sentry.io; style-src 'self' 'unsafe-inline' https://api.mapbox.com; img-src 'self' data: blob: https: http:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://*.mapbox.com https://*.sentry.io https://*.r2.dev; worker-src 'self' blob:; frame-src 'none'" },
                ],
            },
            {
                source: "/images/:path*",
                headers: [
                    { key: "Cache-Control", value: "public, max-age=3600, must-revalidate" },
                ],
            },
        ];
    },
};

export default withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: true,
    widenClientFileUpload: true,
    disableLogger: true,
});

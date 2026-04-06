import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["web-push"],
    images: {
        formats: ["image/avif", "image/webp"],
        remotePatterns: [
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
                hostname: "cdn.shopify.com",
            },
            {
                protocol: "https",
                hostname: "connect.squareup.com",
            },
            {
                protocol: "https",
                hostname: "lh3.googleusercontent.com",
            },
            {
                protocol: "https",
                hostname: "assets.adidas.com",
            },
            // UPCitemdb product photos (screenshots temporaires)
            {
                protocol: "https",
                hostname: "n.nordstrommedia.com",
            },
            {
                protocol: "https",
                hostname: "i5.walmartimages.com",
            },
            {
                protocol: "https",
                hostname: "media.finishline.com",
            },
            {
                protocol: "https",
                hostname: "slimages.macysassets.com",
            },
            {
                protocol: "http",
                hostname: "content.nordstrom.com",
            },
            {
                protocol: "http",
                hostname: "site.unbeatablesale.com",
            },
            {
                protocol: "https",
                hostname: "pub-13766eebd79a46e19db13146812e9218.r2.dev",
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

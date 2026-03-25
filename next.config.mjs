import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        optimizePackageImports: [
            "@untitledui/icons",
            "react-aria-components",
            "motion",
            "recharts",
        ],
    },
};

export default withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: true,
    widenClientFileUpload: true,
    disableLogger: true,
});

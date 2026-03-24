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

export default nextConfig;

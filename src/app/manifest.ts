import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Two-Step — Le stock de ton quartier",
        short_name: "Two-Step",
        description: "Le produit exact que tu cherches, à deux pas de chez toi.",
        start_url: "/discover",
        display: "standalone",
        orientation: "portrait",
        background_color: "#2C1A0E",
        theme_color: "#2C1A0E",
        categories: ["shopping", "lifestyle"],
        lang: "fr",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}

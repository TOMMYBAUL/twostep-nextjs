import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Two-Step — Le stock de ton quartier",
        short_name: "Two-Step",
        description: "Le produit exact que tu cherches, à deux pas de chez toi.",
        start_url: "/discover",
        display: "standalone",
        orientation: "portrait",
        background_color: "#FFFFFF",
        theme_color: "#FFFFFF",
        categories: ["shopping", "lifestyle"],
        lang: "fr",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
            {
                name: "Rechercher",
                short_name: "Recherche",
                url: "/search",
                icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
            },
            {
                name: "Carte",
                short_name: "Carte",
                url: "/explore",
                icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
            },
            {
                name: "Favoris",
                short_name: "Favoris",
                url: "/favorites",
                icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
            },
        ],
    };
}

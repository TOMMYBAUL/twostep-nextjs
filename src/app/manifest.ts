import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Two-Step — Trouvez vos produits à côté de chez vous",
        short_name: "Two-Step",
        description: "Recherchez un produit, trouvez-le dans un commerce près de chez vous",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#6938C6",
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
    };
}

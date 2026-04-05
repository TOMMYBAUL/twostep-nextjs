import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Produit — Votre caisse, connectée au monde",
    description:
        "Two-Step synchronise votre caisse enregistreuse, enrichit vos données produit par IA, et diffuse votre catalogue sur l'app, Google Merchant et Google Maps.",
    openGraph: {
        title: "Produit — Votre caisse, connectée au monde | Two-Step",
        description:
            "Synchronisation POS automatique, enrichissement IA, diffusion multi-canal. Compatible Square, Shopify, Lightspeed, Zettle, Fastmag, Clictill.",
    },
};

export default function ProduitLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}

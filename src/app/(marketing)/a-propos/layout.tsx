import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "À propos — Pourquoi Two-Step existe",
    description:
        "95% du stock en boutique est invisible en ligne. Two-Step connecte les caisses des commerçants pour rendre leur stock visible, automatiquement.",
    openGraph: {
        title: "À propos — Pourquoi Two-Step existe | Two-Step",
        description:
            "Le commerce local a un problème de visibilité. On le résout. Lancé à Toulouse, construit avec les commerçants.",
    },
    alternates: {
        canonical: "https://www.twostep.fr/a-propos",
    },
};

export default function AProposLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}

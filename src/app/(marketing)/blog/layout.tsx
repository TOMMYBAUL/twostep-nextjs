import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Blog",
    description:
        "Conseils pour commerçants, guides shopping local et actualités Two-Step. Rendez votre boutique visible en ligne.",
    openGraph: {
        title: "Blog | Two-Step",
        description:
            "Conseils pour commerçants et guides shopping local à Toulouse.",
    },
    alternates: {
        canonical: "https://www.twostep.fr/blog",
    },
};

export default function BlogLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}

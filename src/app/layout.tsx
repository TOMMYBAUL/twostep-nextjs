import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { RouteProvider } from "@/providers/router-provider";
import { Theme } from "@/providers/theme";
import "@/styles/globals.css";
import { cx } from "@/utils/cx";

const plusJakartaSans = Plus_Jakarta_Sans({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-plus-jakarta-sans",
});

export const metadata: Metadata = {
    title: "Two-Step — Le stock local, visible en temps réel",
    description:
        "Two-Step rend votre stock visible aux consommateurs de votre quartier. En temps réel, sans site e-commerce, sans livraison.",
    openGraph: {
        title: "Two-Step — Le stock local, visible en temps réel",
        description: "Vos clients veulent acheter chez vous. Ils finissent sur Amazon. On règle ça.",
        locale: "fr_FR",
        type: "website",
    },
};

export const viewport: Viewport = {
    themeColor: "#C8813A",
    colorScheme: "light",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="fr" suppressHydrationWarning>
            <body
                className={cx(plusJakartaSans.variable, "antialiased")}
                style={{
                    fontFamily: "var(--font-plus-jakarta-sans), Inter, sans-serif",
                    background: "var(--ts-cream)",
                }}
            >
                <RouteProvider>
                    <Theme>{children}</Theme>
                </RouteProvider>
            </body>
        </html>
    );
}

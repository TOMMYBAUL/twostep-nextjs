import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { RouteProvider } from "@/providers/router-provider";
import { Theme } from "@/providers/theme";
import "@/styles/globals.css";
import { cx } from "@/utils/cx";

const plusJakartaSans = Plus_Jakarta_Sans({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-plus-jakarta-sans",
});

const fraunces = Fraunces({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-fraunces",
});

export const metadata: Metadata = {
    metadataBase: new URL("https://www.twostep.fr"),
    title: {
        default: "Two-Step — Le stock local, visible en temps réel",
        template: "%s | Two-Step",
    },
    description:
        "Two-Step rend votre stock visible aux consommateurs de votre quartier. En temps réel, sans site e-commerce, sans livraison.",
    openGraph: {
        title: "Two-Step — Le stock local, visible en temps réel",
        description: "Vos clients veulent acheter chez vous. Ils finissent sur des boutiques en ligne. On règle ça.",
        locale: "fr_FR",
        type: "website",
        siteName: "Two-Step",
        url: "https://www.twostep.fr",
        images: [{ url: "https://www.twostep.fr/og-image.png", width: 1200, height: 630, alt: "Two-Step — Le stock local" }],
    },
    twitter: {
        card: "summary_large_image",
        title: "Two-Step — Le stock local, visible en temps réel",
        description: "Le produit exact que tu cherches, à deux pas de chez toi.",
        images: ["https://www.twostep.fr/og-image.png"],
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "Two-Step",
    },
    formatDetection: {
        telephone: false,
    },
};

export const viewport: Viewport = {
    themeColor: "#2C1A0E",
    colorScheme: "dark light",
    viewportFit: "cover",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="fr" suppressHydrationWarning>
            <body
                className={cx(plusJakartaSans.variable, fraunces.variable, "antialiased")}
                style={{
                    fontFamily: "var(--font-plus-jakarta-sans), Inter, sans-serif",
                    background: "#130e07",
                }}
            >
                <RouteProvider>
                    <Theme>{children}</Theme>
                </RouteProvider>
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    );
}

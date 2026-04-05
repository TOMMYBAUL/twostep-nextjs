import type { Metadata, Viewport } from "next";
import { Archivo_Black, Barlow, Inter } from "next/font/google";
import { RouteProvider } from "@/providers/router-provider";
import { ConsentAnalytics } from "@/components/consent-analytics";
import { Theme } from "@/providers/theme";
import "@/styles/globals.css";
import { cx } from "@/utils/cx";
import { ZoomReset } from "@/components/zoom-reset";

const archivoBlack = Archivo_Black({
    subsets: ["latin"],
    display: "swap",
    weight: ["400"],
    variable: "--font-archivo-black",
});

const barlow = Barlow({
    subsets: ["latin"],
    display: "swap",
    weight: ["400", "500", "600", "700", "800"],
    variable: "--font-barlow",
});

const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    weight: ["400", "500", "600"],
    variable: "--font-inter",
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
    themeColor: "#FFFFFF",
    colorScheme: "light",
    viewportFit: "cover",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="fr" className="light-mode" style={{ colorScheme: "light" }} suppressHydrationWarning>
            <body
                className={cx(archivoBlack.variable, barlow.variable, inter.variable, "antialiased")}
                style={{
                    background: "#FFFFFF",
                }}
            >
                <ZoomReset />
                <RouteProvider>
                    <Theme>{children}</Theme>
                </RouteProvider>
                <ConsentAnalytics />
            </body>
        </html>
    );
}

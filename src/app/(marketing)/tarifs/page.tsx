import type { Metadata } from "next";
import TarifsScreen from "./tarifs-screen";

export const metadata: Metadata = {
    title: "Tarifs",
    description:
        "Gratuit pour commencer. Connectez votre caisse et rendez vos produits visibles en ligne sans engagement.",
    openGraph: {
        title: "Tarifs | Two-Step",
        description:
            "Plan Starter gratuit, sans limite de temps. Votre boutique en ligne en 2 minutes.",
    },
};

export default function TarifsPage() {
    return <TarifsScreen />;
}

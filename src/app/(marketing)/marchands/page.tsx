import type { Metadata } from "next";
import MarchandsScreen from "./marchands-screen";

export const metadata: Metadata = {
    title: "Marchands",
    description:
        "Faites-vous trouver par vos futurs clients. Two-Step rend vos produits visibles en ligne automatiquement. Compatible avec tous les logiciels de caisse.",
    openGraph: {
        title: "Marchands | Two-Step",
        description:
            "Vos produits sont en boutique. Vos clients sont sur leur téléphone. Two-Step fait le lien.",
    },
};

export default function MarchandsPage() {
    return <MarchandsScreen />;
}

import type { Metadata } from "next";
import TarifsScreen from "./tarifs-screen";

export const metadata: Metadata = {
    title: "Tarifs",
    description:
        "2 mois gratuits puis à partir de 19€/mois, verrouillé à vie. Rendez vos produits visibles en ligne sans engagement.",
    openGraph: {
        title: "Tarifs | Two-Step",
        description:
            "2 mois gratuits, puis à partir de 19€/mois pour les pionniers. Compatible avec tous les logiciels de caisse.",
    },
    alternates: {
        canonical: "https://www.twostep.fr/tarifs",
    },
};

const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
        {
            "@type": "Question",
            name: "Comment fonctionne l'essai gratuit ?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Vous commencez par 2 mois gratuits, sans carte bancaire. Votre tarif ensuite dépend de quand vous nous rejoignez : les 30 premiers marchands paient 19€/mois (verrouillé à vie), puis c'est 29€, puis 39€.",
            },
        },
        {
            "@type": "Question",
            name: "Mon logiciel de caisse est-il compatible ?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Oui, tous les logiciels sont compatibles. Vous exportez votre catalogue en CSV ou Excel depuis votre logiciel actuel, et on s'occupe du reste. Pour Square, Shopify, Lightspeed et Zettle, la synchronisation est même automatique.",
            },
        },
        {
            "@type": "Question",
            name: "Combien de temps pour se lancer ?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Environ 10 minutes. Vous exportez votre catalogue, vous l'importez dans Two-Step, et nos algorithmes enrichissent automatiquement chaque produit avec photos et descriptions.",
            },
        },
        {
            "@type": "Question",
            name: "Puis-je annuler à tout moment ?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Oui, sans engagement. Vous pouvez annuler votre abonnement à tout moment depuis les paramètres.",
            },
        },
        {
            "@type": "Question",
            name: "Est-ce que ça fonctionne si je n'ai pas de photos produit ?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Oui. Notre IA trouve automatiquement les photos de vos produits grâce aux codes-barres et aux noms. Pour les marques connues, le taux de réussite dépasse 95%.",
            },
        },
        {
            "@type": "Question",
            name: "Comment Two-Step m'apporte des clients ?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Vos produits apparaissent dans l'app Two-Step, sur Google Shopping et Google Maps. Les consommateurs qui cherchent un produit près de chez eux voient votre boutique et viennent directement.",
            },
        },
        {
            "@type": "Question",
            name: "Comment je mets à jour mon stock ?",
            acceptedAnswer: {
                "@type": "Answer",
                text: "Trois options selon vos habitudes : le Récap du jour (2 minutes le soir), les boutons +/- sur chaque produit, ou un nouvel import CSV pour tout recaler. Si vous avez un POS compatible, c'est même automatique.",
            },
        },
    ],
};

export default function TarifsPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />
            <TarifsScreen />
        </>
    );
}

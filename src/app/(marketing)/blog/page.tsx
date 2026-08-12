import { ArticleCard } from "./components/article-card";

const articles = [
    {
        slug: "shopping-maroquinerie-toulouse",
        title: "Shopping maroquinerie à Toulouse : les meilleures boutiques de sacs et accessoires cuir",
        description:
            "Sacs, portefeuilles, ceintures, petite maroquinerie… Guide des boutiques indépendantes à Toulouse, avec l'astuce pour vérifier le stock avant de te déplacer.",
        publishedAt: "2026-08-12",
        readingTime: "7 min",
        category: "consommateurs" as const,
    },
    {
        slug: "shopping-bijoux-toulouse",
        title: "Shopping bijoux à Toulouse : trouver le bon bijou en boutique",
        description:
            "Tu cherches un bijou à Toulouse ? Capitole, Carmes, Saint-Étienne... Guide des meilleures boutiques indépendantes et comment éviter le déplacement pour rien.",
        publishedAt: "2026-05-20",
        readingTime: "6 min",
        category: "consommateurs" as const,
    },
    {
        slug: "shopping-cosmetique-toulouse",
        title: "Shopping cosmétique à Toulouse : trouver tes produits beauté en boutique",
        description:
            "Concept stores, parapharmacies, boutiques bio... Guide pour trouver tes marques préférées en stock avant de traverser la ville pour rien.",
        publishedAt: "2026-06-08",
        readingTime: "6 min",
        category: "consommateurs" as const,
    },
    {
        slug: "attirer-clients-boutique-toulouse",
        title: "Comment attirer plus de clients dans ta boutique à Toulouse : 6 actions concrètes en 2026",
        description:
            "Trafic en baisse, clients qui comparent sur internet... 6 actions concrètes pour attirer plus de clients dans ta boutique indépendante à Toulouse.",
        publishedAt: "2026-05-04",
        readingTime: "7 min",
        category: "marchands" as const,
    },
    {
        slug: "boutique-visible-google",
        title: "Comment rendre votre boutique visible sur Google sans site e-commerce",
        description:
            "95% du stock en boutique est invisible en ligne. Voici comment apparaître sur Google Shopping et Google Maps sans créer de site.",
        publishedAt: "2026-04-15",
        readingTime: "8 min",
        category: "marchands" as const,
    },
    {
        slug: "logiciel-de-caisse-commerce",
        title: "Quel logiciel de caisse choisir pour un commerce indépendant en 2026",
        description:
            "Square, Lightspeed, Zettle, SumUp, Shopify POS... Comparatif honnête pour choisir le bon outil selon votre activité.",
        publishedAt: "2026-04-15",
        readingTime: "10 min",
        category: "marchands" as const,
    },
    {
        slug: "boutiques-mode-toulouse",
        title: "Les meilleures boutiques de mode à Toulouse",
        description:
            "Notre sélection quartier par quartier : Capitole, Saint-Cyprien, Carmes, Saint-Étienne. Mode femme, homme et créateurs.",
        publishedAt: "2026-04-15",
        readingTime: "6 min",
        category: "consommateurs" as const,
    },
    {
        slug: "shopping-sneakers-toulouse",
        title: "Shopping sneakers à Toulouse : où trouver les modèles que tu cherches",
        description:
            "Les spots sneakers toulousains, des shops spécialisés aux multimarques. Plus besoin de commander en ligne.",
        publishedAt: "2026-04-15",
        readingTime: "5 min",
        category: "consommateurs" as const,
    },
];

export default function BlogPage() {
    return (
        <section className="px-6 py-20 md:px-12 md:py-[120px]">
            <div className="mx-auto max-w-[1100px]">
                <h1 className="font-heading text-primary text-[32px] md:text-[48px] mb-2">
                    Blog
                </h1>
                <p className="text-tertiary text-[15px] md:text-[17px] mb-10">
                    Conseils pour commerçants et guides shopping local
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {articles.map((article) => (
                        <ArticleCard key={article.slug} {...article} />
                    ))}
                </div>
            </div>
        </section>
    );
}

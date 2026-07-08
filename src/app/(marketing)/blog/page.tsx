import { ArticleCard } from "./components/article-card";

const articles = [
    {
        slug: "shopping-sport-toulouse",
        title: "Shopping sport à Toulouse : où trouver ton équipement en boutique indépendante",
        description:
            "Running, cyclisme, escalade, sports de salle... Guide des meilleures boutiques sport indépendantes à Toulouse et comment éviter le déplacement pour rien.",
        publishedAt: "2026-07-08",
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

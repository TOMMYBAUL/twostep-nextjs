"use client";

import Link from "next/link";

interface ArticleLayoutProps {
    title: string;
    description: string;
    slug: string;
    publishedAt: string;
    updatedAt?: string;
    readingTime: string;
    category: "marchands" | "consommateurs";
    children: React.ReactNode;
}

const allArticles: { title: string; slug: string; category: "marchands" | "consommateurs" }[] = [
    {
        title: "Comment rendre votre boutique visible sur Google sans site e-commerce",
        slug: "boutique-visible-google",
        category: "marchands",
    },
    {
        title: "Quel logiciel de caisse choisir pour un commerce indépendant en 2026",
        slug: "logiciel-de-caisse-commerce",
        category: "marchands",
    },
    {
        title: "Les meilleures boutiques de mode à Toulouse",
        slug: "boutiques-mode-toulouse",
        category: "consommateurs",
    },
    {
        title: "Shopping sneakers à Toulouse : où trouver les modèles que tu cherches",
        slug: "shopping-sneakers-toulouse",
        category: "consommateurs",
    },
];

export function ArticleLayout({
    title,
    description,
    slug,
    publishedAt,
    updatedAt,
    readingTime,
    category,
    children,
}: ArticleLayoutProps) {
    const badgeLabel =
        category === "marchands" ? "Marchands" : "Guide local";
    const badgeClasses =
        category === "marchands"
            ? "bg-[#1A1A1A] text-white"
            : "bg-[#4268FF] text-white";

    const formattedDate = new Date(publishedAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    const formattedUpdatedAt = updatedAt
        ? new Date(updatedAt).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
          })
        : null;

    const similar = allArticles
        .filter((a) => a.category === category && a.slug !== slug)
        .slice(0, 2);

    const isMarchands = category === "marchands";

    return (
        <>
            {/* Hero */}
            <section className="bg-[#1A1F36] text-white min-h-[320px] flex items-center">
                <div className="mx-auto max-w-[1100px] w-full px-6 md:px-12 py-16 md:py-20">
                    <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mb-6 ${badgeClasses}`}
                    >
                        {badgeLabel}
                    </span>
                    <h1 className="font-heading text-[28px] md:text-[42px] leading-tight mb-5 max-w-[720px]">
                        {title}
                    </h1>
                    <div className="flex items-center gap-3 text-white/50 text-[13px]">
                        <time dateTime={publishedAt}>{formattedDate}</time>
                        {formattedUpdatedAt && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span>Mis à jour le {formattedUpdatedAt}</span>
                            </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{readingTime} de lecture</span>
                    </div>
                </div>
            </section>

            {/* Body */}
            <section className="bg-primary">
                <div className="mx-auto max-w-[1100px] pt-12 pb-20 px-6 md:px-12">
                    <div className="flex gap-12">
                        {/* Article content */}
                        <article
                            className={[
                                "flex-1 max-w-[680px]",
                                "[&>h2]:text-[22px] [&>h2]:font-bold [&>h2]:text-primary [&>h2]:mt-10 [&>h2]:mb-4 [&>h2]:scroll-mt-24",
                                "[&>h3]:text-[17px] [&>h3]:font-semibold [&>h3]:text-primary [&>h3]:mt-8 [&>h3]:mb-3",
                                "[&>p]:text-[15px] [&>p]:leading-relaxed [&>p]:text-tertiary [&>p]:mb-5",
                                "[&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-5 [&>ul>li]:text-[15px] [&>ul>li]:text-tertiary [&>ul>li]:mb-2",
                                "[&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-5 [&>ol>li]:text-[15px] [&>ol>li]:text-tertiary [&>ol>li]:mb-2",
                                "[&>table]:w-full [&>table]:text-[13px] [&>table]:mb-6",
                                "[&_th]:bg-secondary [&_th]:font-semibold [&_th]:text-primary [&_th]:p-3 [&_th]:text-left",
                                "[&_td]:border-b [&_td]:border-secondary [&_td]:p-3 [&_td]:text-tertiary",
                                "[&>blockquote]:border-l-4 [&>blockquote]:border-brand [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-secondary",
                            ].join(" ")}
                        >
                            {children}
                        </article>

                        {/* Sidebar — desktop only */}
                        <aside className="hidden lg:block w-[280px] shrink-0">
                            <div className="sticky top-24 space-y-8">
                                {/* CTA card */}
                                <div className="rounded-xl bg-secondary p-5">
                                    {isMarchands ? (
                                        <>
                                            <p className="text-primary font-bold text-[15px] mb-2">
                                                Rendez votre boutique visible
                                            </p>
                                            <p className="text-tertiary text-[13px] mb-4">
                                                Vos produits sur Google en 10 minutes, sans site e-commerce.
                                            </p>
                                            <Link
                                                href="/onboarding"
                                                className="block text-center rounded-lg bg-[#1A1A1A] text-white text-[13px] font-bold py-2.5 px-4 no-underline hover:bg-[#333] transition-colors duration-150"
                                            >
                                                Inscrire ma boutique →
                                            </Link>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-primary font-bold text-[15px] mb-2">
                                                Découvrez le stock local
                                            </p>
                                            <p className="text-tertiary text-[13px] mb-4">
                                                Trouvez ce que vous cherchez dans les boutiques près de chez vous.
                                            </p>
                                            <Link
                                                href="/discover"
                                                className="block text-center rounded-lg bg-brand-solid text-white text-[13px] font-bold py-2.5 px-4 no-underline hover:bg-brand-solid_hover transition-colors duration-150"
                                            >
                                                Explorer les boutiques →
                                            </Link>
                                        </>
                                    )}
                                </div>

                                {/* Divider */}
                                <div className="h-px bg-secondary" />

                                {/* Related articles */}
                                {similar.length > 0 && (
                                    <div>
                                        <p className="text-quaternary text-[11px] font-semibold uppercase tracking-wider mb-3">
                                            Articles similaires
                                        </p>
                                        <div className="space-y-2.5">
                                            {similar.map((article) => (
                                                <Link
                                                    key={article.slug}
                                                    href={`/blog/${article.slug}`}
                                                    className="block text-brand-secondary text-[13px] leading-snug hover:underline no-underline"
                                                >
                                                    {article.title}
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </aside>
                    </div>

                    {/* CTA final pleine largeur */}
                    <div className="bg-[#1A1F36] rounded-2xl p-8 md:p-12 text-center mt-16">
                        <h2 className="text-white font-heading text-[22px] md:text-[28px] mb-3">
                            {isMarchands
                                ? "Prêt à rendre votre boutique visible ?"
                                : "Envie de shopper local ?"}
                        </h2>
                        <p className="text-white/60 text-[15px] mb-6 max-w-[480px] mx-auto">
                            {isMarchands
                                ? "Rejoignez les commerçants qui rendent leur stock visible en ligne en 10 minutes."
                                : "Découvrez ce qui est disponible dans les boutiques près de chez vous."}
                        </p>
                        <Link
                            href={isMarchands ? "/onboarding" : "/discover"}
                            className={[
                                "inline-block rounded-lg text-[14px] font-bold py-3 px-6 no-underline transition-colors duration-150",
                                isMarchands
                                    ? "bg-white text-[#1A1F36] hover:bg-white/90"
                                    : "bg-brand-solid text-white hover:bg-brand-solid_hover",
                            ].join(" ")}
                        >
                            {isMarchands
                                ? "Inscrire ma boutique gratuitement →"
                                : "Explorer les boutiques →"}
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}

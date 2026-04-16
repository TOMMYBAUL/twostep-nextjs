import Image from "next/image";
import Link from "next/link";

const ARTICLE_IMAGES: Record<string, string> = {
    "boutique-visible-google": "/images/blog/boutique-visible-google.webp",
    "logiciel-de-caisse-commerce": "/images/blog/logiciel-de-caisse.webp",
    "boutiques-mode-toulouse": "/images/blog/boutiques-mode-toulouse.webp",
    "shopping-sneakers-toulouse": "/images/blog/shopping-sneakers-toulouse.webp",
};

interface ArticleCardProps {
    title: string;
    description: string;
    slug: string;
    publishedAt: string;
    readingTime: string;
    category: "marchands" | "consommateurs";
}

export function ArticleCard({
    title,
    description,
    slug,
    publishedAt,
    readingTime,
    category,
}: ArticleCardProps) {
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

    return (
        <Link
            href={`/blog/${slug}`}
            className="group block rounded-2xl border border-secondary bg-primary overflow-hidden hover:shadow-lg transition-shadow duration-200 no-underline"
        >
            <div className="relative h-[180px] overflow-hidden">
                {ARTICLE_IMAGES[slug] ? (
                    <Image
                        src={ARTICLE_IMAGES[slug]}
                        alt={title}
                        fill
                        sizes="(max-width: 768px) 100vw, 550px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                ) : (
                    <div className="h-full w-full bg-[#1A1F36]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                <span
                    className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-semibold ${badgeClasses}`}
                >
                    {badgeLabel}
                </span>
            </div>

            <div className="p-5">
                <h2 className="text-primary font-bold text-[17px] leading-snug mb-2 group-hover:text-brand-secondary transition-colors duration-150">
                    {title}
                </h2>
                <p className="text-tertiary text-[13px] leading-relaxed line-clamp-2 mb-4">
                    {description}
                </p>
                <div className="flex items-center gap-3 text-quaternary text-[11px]">
                    <span>{formattedDate}</span>
                    <span aria-hidden="true">·</span>
                    <span>{readingTime} de lecture</span>
                </div>
            </div>
        </Link>
    );
}
